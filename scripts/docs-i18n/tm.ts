#!/usr/bin/env node
import oracledb, { Pool } from 'oracledb';

export interface TMEntry {
	cache_key: string;
	segment_id: string;
	source_path: string;
	text_hash: string;
	text: string;
	translated: string;
	provider: string;
	model: string;
	src_lang: string;
	tgt_lang: string;
	updated_at: string;
	metadata?: Record<string, any>;
}

export class TranslationMemory {
	private pool: Pool;
	private tableName: string;

	constructor(pool: Pool, tableName: string = 'TRANSLATION_MEMORY') {
		this.pool = pool;
		this.tableName = tableName;
	}

	async init(): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(`
				BEGIN
				EXECUTE IMMEDIATE '
					CREATE TABLE ${this.tableName} (
					CACHE_KEY VARCHAR2(256) PRIMARY KEY,
					SEGMENT_ID VARCHAR2(512) NOT NULL,
					SOURCE_PATH VARCHAR2(1024) NOT NULL,
					TEXT_HASH VARCHAR2(64) NOT NULL,
					TEXT CLOB NOT NULL,
					TRANSLATED CLOB,
					PROVIDER VARCHAR2(100),
					MODEL VARCHAR2(100),
					SRC_LANG VARCHAR2(10),
					TGT_LANG VARCHAR2(10),
					UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					METADATA JSON
					)
				';
				EXCEPTION
				WHEN OTHERS THEN
					IF SQLCODE != -955 THEN RAISE; END IF;
			`);
			await connection.commit();

			const indexes = [
				`CREATE INDEX idx_tm_segment_id ON ${this.tableName} (SEGMENT_ID)`,
				`CREATE INDEX idx_tm_text_hash ON ${this.tableName} (TEXT_HASH)`,
				`CREATE INDEX idx_tm_lang ON ${this.tableName} (SRC_LANG, TGT_LANG)`,
				`CREATE INDEX idx_tm_metadata ON ${this.tableName} (METADATA) INDEXTYPE IS CTXSYS.CONTEXT`,
			];

			for (const sql of indexes) {
				try {
					await connection.execute(sql);
					await connection.commit();
				} catch {}
			}
		} finally {
			connection.close();
		}
	}

	async get(cacheKey: string): Promise<TMEntry | null> {
		const connection = await this.pool.getConnection();
		try {
			const result = await connection.execute(
				`SELECT
				CACHE_KEY,
				SEGMENT_ID,
				SOURCE_PATH,
				TEXT_HASH,
				TEXT,
				TRANSLATED,
				PROVIDER,
				MODEL,
				SRC_LANG,
				TGT_LANG,
				UPDATED_AT,
				METADATA
				FROM ${this.tableName}
				WHERE CACHE_KEY = :cacheKey
				AND TRANSLATED IS NOT NULL
				AND LENGTH(TRANSLATED) > 0`,
				{ cacheKey },
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			if (result.rows.length === 0) return null;
			const row = result.rows[0] as any;
			return {
				cache_key: row.CACHE_KEY,
				segment_id: row.SEGMENT_ID,
				source_path: row.SOURCE_PATH,
				text_hash: row.TEXT_HASH,
				text: row.TEXT,
				translated: row.TRANSLATED,
				provider: row.PROVIDER,
				model: row.MODEL,
				src_lang: row.SRC_LANG,
				tgt_lang: row.TGT_LANG,
				updated_at: row.UPDATED_AT,
				metadata: row.METADATA ? JSON.parse(row.METADATA) : undefined,
			};
		} finally {
			connection.close();
		}
	}

	async put(entry: TMEntry): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;

			await connection.execute(
				`MERGE INTO ${this.tableName} t
				USING (SELECT :cacheKey as CACHE_KEY FROM DUAL) s
				ON (t.CACHE_KEY = s.CACHE_KEY)
				WHEN MATCHED THEN
				UPDATE SET
					SEGMENT_ID = :segmentId,
					SOURCE_PATH = :sourcePath,
					TEXT_HASH = :textHash,
					TEXT = :text,
					TRANSLATED = :translated,
					PROVIDER = :provider,
					MODEL = :model,
					SRC_LANG = :srcLang,
					TGT_LANG = :tgtLang,
					UPDATED_AT = CURRENT_TIMESTAMP,
					METADATA = JSON(:metadata)
				WHEN NOT MATCHED THEN
				INSERT (
					CACHE_KEY,
					SEGMENT_ID,
					SOURCE_PATH,
					TEXT_HASH,
					TEXT,
					TRANSLATED,
					PROVIDER,
					MODEL,
					SRC_LANG,
					TGT_LANG,
					UPDATED_AT,
					METADATA
				) VALUES (
					:cacheKey,
					:segmentId,
					:sourcePath,
					:textHash,
					:text,
					:translated,
					:provider,
					:model,
					:srcLang,
					:tgtLang,
					CURRENT_TIMESTAMP,
					JSON(:metadata)
				)`,
				{
					cacheKey: entry.cache_key,
					segmentId: entry.segment_id,
					sourcePath: entry.source_path,
					textHash: entry.text_hash,
					text: entry.text,
					translated: entry.translated,
					provider: entry.provider,
					model: entry.model,
					srcLang: entry.src_lang,
					tgtLang: entry.tgt_lang,
					metadata: metadataJson,
				}
			);
			await connection.commit();
		} finally {
			connection.close();
		}
	}

	async getBySegment(segmentId: string): Promise<TMEntry[]> {
		const connection = await this.pool.getConnection();
		try {
			const result = await connection.execute(
				`SELECT
				CACHE_KEY,
				SEGMENT_ID,
				SOURCE_PATH,
				TEXT_HASH,
				TEXT,
				TRANSLATED,
				PROVIDER,
				MODEL,
				SRC_LANG,
				TGT_LANG,
				UPDATED_AT,
				METADATA
				FROM ${this.tableName}
				WHERE SEGMENT_ID = :segmentId
				AND TRANSLATED IS NOT NULL
				AND LENGTH(TRANSLATED) > 0
				ORDER BY UPDATED_AT DESC`,
				{ segmentId },
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			return (result.rows as any[]).map((row) => ({
				cache_key: row.CACHE_KEY,
				segment_id: row.SEGMENT_ID,
				source_path: row.SOURCE_PATH,
				text_hash: row.TEXT_HASH,
				text: row.TEXT,
				translated: row.TRANSLATED,
				provider: row.PROVIDER,
				model: row.MODEL,
				src_lang: row.SRC_LANG,
				tgt_lang: row.TGT_LANG,
				updated_at: row.UPDATED_AT,
				metadata: row.METADATA ? JSON.parse(row.METADATA) : undefined,
			}));
		} finally {
			connection.close();
		}
	}

	async search(query: string): Promise<TMEntry[]> {
		const connection = await this.pool.getConnection();
		try {
			const result = await connection.execute(
				`SELECT
				CACHE_KEY,
				SEGMENT_ID,
				SOURCE_PATH,
				TEXT_HASH,
				TEXT,
				TRANSLATED,
				PROVIDER,
				MODEL,
				SRC_LANG,
				TGT_LANG,
				UPDATED_AT,
				METADATA
				FROM ${this.tableName}
				WHERE
				(UPPER(TEXT) LIKE UPPER(:query) OR UPPER(TRANSLATED) LIKE UPPER(:query))
				AND TRANSLATED IS NOT NULL
				AND LENGTH(TRANSLATED) > 0
				ORDER BY UPDATED_AT DESC
				FETCH FIRST 100 ROWS ONLY`,
				{ query: `%${query}%` },
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			return (result.rows as any[]).map((row) => ({
				cache_key: row.CACHE_KEY,
				segment_id: row.SEGMENT_ID,
				source_path: row.SOURCE_PATH,
				text_hash: row.TEXT_HASH,
				text: row.TEXT,
				translated: row.TRANSLATED,
				provider: row.PROVIDER,
				model: row.MODEL,
				src_lang: row.SRC_LANG,
				tgt_lang: row.TGT_LANG,
				updated_at: row.UPDATED_AT,
				metadata: row.METADATA ? JSON.parse(row.METADATA) : undefined,
			}));
		} finally {
			connection.close();
		}
	}

	async getStats(): Promise<{
		total: number;
		byLang: Record<string, number>;
		byProvider: Record<string, number>;
		lastUpdated: string | null;
	}> {
		const connection = await this.pool.getConnection();
		try {
			const totalResult = await connection.execute(
				`SELECT COUNT(*) as TOTAL FROM ${this.tableName}
				WHERE TRANSLATED IS NOT NULL AND LENGTH(TRANSLATED) > 0`,
				{},
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			const byLangResult = await connection.execute(
				`SELECT SRC_LANG, TGT_LANG, COUNT(*) as COUNT
				FROM ${this.tableName}
				WHERE TRANSLATED IS NOT NULL AND LENGTH(TRANSLATED) > 0
				GROUP BY SRC_LANG, TGT_LANG`,
				{},
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			const byProviderResult = await connection.execute(
				`SELECT PROVIDER, COUNT(*) as COUNT
				FROM ${this.tableName}
				WHERE TRANSLATED IS NOT NULL AND LENGTH(TRANSLATED) > 0
				GROUP BY PROVIDER`,
				{},
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			const lastUpdatedResult = await connection.execute(
				`SELECT UPDATED_AT FROM ${this.tableName}
				WHERE TRANSLATED IS NOT NULL AND LENGTH(TRANSLATED) > 0
				ORDER BY UPDATED_AT DESC
				FETCH FIRST 1 ROW ONLY`,
				{},
				{ outFormat: oracledb.OUT_FORMAT_OBJECT }
			);

			const byLang: Record<string, number> = {};
			for (const row of byLangResult.rows as any[]) {
				byLang[`${row.SRC_LANG}->${row.TGT_LANG}`] = Number(row.COUNT);
			}

			const byProvider: Record<string, number> = {};
			for (const row of byProviderResult.rows as any[]) {
				byProvider[row.PROVIDER || 'unknown'] = Number(row.COUNT);
			}

			return {
				total: Number((totalResult.rows[0] as any)?.TOTAL || 0),
				byLang,
				byProvider,
				lastUpdated: (lastUpdatedResult.rows[0] as any)?.UPDATED_AT || null,
			};
		} finally {
			connection.close();
		}
	}

	async clear(): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(`DELETE FROM ${this.tableName}`);
			await connection.commit();
		} finally {
			connection.close();
		}
	}

	async delete(cacheKey: string): Promise<void> {
		const connection = await this.pool.getConnection();
		try {
			await connection.execute(
				`DELETE FROM ${this.tableName} WHERE CACHE_KEY = :cacheKey`,
				{ cacheKey }
			);
			await connection.commit();
		} finally {
			connection.close();
		}
	}

	async close(): Promise<void> {
		await this.pool.close();
	}
}

export async function createTranslationMemory(
	config: {
		user: string;
		password: string;
		connectionString: string;
		poolMin?: number;
		poolMax?: number;
		poolIncrement?: number;
	},
	tableName: string = 'TRANSLATION_MEMORY'
): Promise<TranslationMemory> {
	oracledb.initOracleClient();

	const pool = await oracledb.createPool({
		user: config.user,
		password: config.password,
		connectionString: config.connectionString,
		poolMin: config.poolMin || 1,
		poolMax: config.poolMax || 10,
		poolIncrement: config.poolIncrement || 1,
	});

	const tm = new TranslationMemory(pool, tableName);
	await tm.init();
	return tm;
}

export async function loadTranslationMemory(
	config: {
		user: string;
		password: string;
		connectionString: string;
	}
): Promise<TranslationMemory> {
	if (!config) {
		throw new Error('Oracle config required for loadTranslationMemory');
	}

	return createTranslationMemory(config);
}