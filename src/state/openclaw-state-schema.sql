CREATE TABLE auth_profile_stores (
  store_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  store_json VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE TABLE auth_profile_state (
  store_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  state_json VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE TABLE diagnostic_events (
  scope VARCHAR2(4000) NOT NULL,
  event_key VARCHAR2(4000) NOT NULL,
  payload_json VARCHAR2(4000) NOT NULL,
  created_at NUMBER NOT NULL,
  PRIMARY KEY (scope, event_key)
);

CREATE INDEX idx_diagnostic_events_scope_created
  ON diagnostic_events(scope, created_at, event_key);

CREATE TABLE diagnostic_stability_bundles (
  bundle_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  reason VARCHAR2(4000) NOT NULL,
  generated_at VARCHAR2(4000) NOT NULL,
  bundle_json VARCHAR2(4000) NOT NULL,
  created_at NUMBER NOT NULL
);

CREATE INDEX idx_diagnostic_stability_bundles_created
  ON diagnostic_stability_bundles(created_at DESC, bundle_key);

CREATE TABLE state_leases (
  scope VARCHAR2(4000) NOT NULL,
  lease_key VARCHAR2(4000) NOT NULL,
  owner VARCHAR2(4000) NOT NULL,
  expires_at NUMBER,
  heartbeat_at NUMBER,
  payload_json VARCHAR2(4000),
  created_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  PRIMARY KEY (scope, lease_key)
);

CREATE INDEX idx_state_leases_expiry
  ON state_leases(expires_at, scope, lease_key)
  WHERE expires_at IS NOT NULL;

CREATE INDEX idx_state_leases_owner
  ON state_leases(owner, updated_at DESC);

CREATE TABLE exec_approvals_config (
  config_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  raw_json VARCHAR2(4000) NOT NULL,
  socket_path VARCHAR2(4000),
  has_socket_token NUMBER NOT NULL,
  default_security VARCHAR2(4000),
  default_ask VARCHAR2(4000),
  default_ask_fallback VARCHAR2(4000),
  auto_allow_skills NUMBER,
  agent_count NUMBER NOT NULL,
  allowlist_count NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE schema_meta (
  meta_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  role VARCHAR2(4000) NOT NULL,
  schema_version NUMBER NOT NULL,
  agent_id VARCHAR2(4000),
  app_version VARCHAR2(4000),
  created_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE TABLE device_pairing_pending (
  request_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  device_id VARCHAR2(4000) NOT NULL,
  public_key VARCHAR2(4000) NOT NULL,
  display_name VARCHAR2(4000),
  platform VARCHAR2(4000),
  device_family VARCHAR2(4000),
  client_id VARCHAR2(4000),
  client_mode VARCHAR2(4000),
  role VARCHAR2(4000),
  roles_json VARCHAR2(4000),
  scopes_json VARCHAR2(4000),
  remote_ip VARCHAR2(4000),
  silent NUMBER,
  is_repair NUMBER,
  ts NUMBER NOT NULL
);

CREATE INDEX idx_device_pairing_pending_device
  ON device_pairing_pending(device_id, ts DESC);

CREATE TABLE device_pairing_paired (
  device_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  public_key VARCHAR2(4000) NOT NULL,
  display_name VARCHAR2(4000),
  platform VARCHAR2(4000),
  device_family VARCHAR2(4000),
  client_id VARCHAR2(4000),
  client_mode VARCHAR2(4000),
  role VARCHAR2(4000),
  roles_json VARCHAR2(4000),
  scopes_json VARCHAR2(4000),
  approved_scopes_json VARCHAR2(4000),
  remote_ip VARCHAR2(4000),
  tokens_json VARCHAR2(4000),
  created_at_ms NUMBER NOT NULL,
  approved_at_ms NUMBER NOT NULL,
  last_seen_at_ms NUMBER,
  last_seen_reason TEXT
);

CREATE INDEX idx_device_pairing_paired_approved
  ON device_pairing_paired(approved_at_ms DESC, device_id);

CREATE TABLE device_bootstrap_tokens (
  token_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  token VARCHAR2(4000) NOT NULL,
  ts NUMBER NOT NULL,
  device_id VARCHAR2(4000),
  public_key VARCHAR2(4000),
  profile_json VARCHAR2(4000),
  redeemed_profile_json VARCHAR2(4000),
  pending_profile_json VARCHAR2(4000),
  issued_at_ms NUMBER NOT NULL,
  last_used_at_ms INTEGER
);

CREATE INDEX idx_device_bootstrap_tokens_ts
  ON device_bootstrap_tokens(ts);

CREATE TABLE node_pairing_pending (
  request_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  node_id VARCHAR2(4000) NOT NULL,
  display_name VARCHAR2(4000),
  platform VARCHAR2(4000),
  version VARCHAR2(4000),
  core_version VARCHAR2(4000),
  ui_version VARCHAR2(4000),
  device_family VARCHAR2(4000),
  model_identifier VARCHAR2(4000),
  client_id VARCHAR2(4000),
  client_mode VARCHAR2(4000),
  caps_json VARCHAR2(4000),
  commands_json VARCHAR2(4000),
  permissions_json VARCHAR2(4000),
  remote_ip VARCHAR2(4000),
  silent NUMBER,
  ts NUMBER NOT NULL
);

CREATE INDEX idx_node_pairing_pending_node
  ON node_pairing_pending(node_id, ts DESC);

CREATE TABLE node_pairing_paired (
  node_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  token VARCHAR2(4000) NOT NULL,
  display_name VARCHAR2(4000),
  platform VARCHAR2(4000),
  version VARCHAR2(4000),
  core_version VARCHAR2(4000),
  ui_version VARCHAR2(4000),
  device_family VARCHAR2(4000),
  model_identifier VARCHAR2(4000),
  client_id VARCHAR2(4000),
  client_mode VARCHAR2(4000),
  caps_json VARCHAR2(4000),
  commands_json VARCHAR2(4000),
  permissions_json VARCHAR2(4000),
  remote_ip VARCHAR2(4000),
  bins_json VARCHAR2(4000),
  created_at_ms NUMBER NOT NULL,
  approved_at_ms NUMBER NOT NULL,
  last_connected_at_ms NUMBER,
  last_seen_at_ms NUMBER,
  last_seen_reason TEXT
);

CREATE INDEX idx_node_pairing_paired_approved
  ON node_pairing_paired(approved_at_ms DESC, node_id);

CREATE TABLE device_identities (
  identity_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  device_id VARCHAR2(4000) NOT NULL,
  public_key_pem VARCHAR2(4000) NOT NULL,
  private_key_pem VARCHAR2(4000) NOT NULL,
  created_at_ms NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_device_identities_device
  ON device_identities(device_id, updated_at_ms DESC);

CREATE TABLE device_auth_tokens (
  device_id VARCHAR2(4000) NOT NULL,
  role VARCHAR2(4000) NOT NULL,
  token VARCHAR2(4000) NOT NULL,
  scopes_json VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL,
  PRIMARY KEY (device_id, role)
);

CREATE INDEX idx_device_auth_tokens_updated
  ON device_auth_tokens(updated_at_ms DESC, device_id, role);

CREATE TABLE android_notification_recent_packages (
  package_name VARCHAR2(255) NOT NULL PRIMARY KEY,
  sort_order NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_android_notification_recent_packages_order
  ON android_notification_recent_packages(sort_order, package_name);

CREATE TABLE macos_port_guardian_records (
  pid NUMBER NOT NULL PRIMARY KEY,
  port NUMBER NOT NULL,
  command VARCHAR2(4000) NOT NULL,
  mode VARCHAR2(4000) NOT NULL,
  timestamp NUMBER NOT NULL
);

CREATE INDEX idx_macos_port_guardian_records_port
  ON macos_port_guardian_records(port, timestamp DESC);

CREATE TABLE workspace_setup_state (
  workspace_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  workspace_path VARCHAR2(4000) NOT NULL,
  version NUMBER NOT NULL,
  bootstrap_seeded_at VARCHAR2(4000),
  setup_completed_at VARCHAR2(4000),
  updated_at NUMBER NOT NULL
);

CREATE INDEX idx_workspace_setup_state_path
  ON workspace_setup_state(workspace_path);

CREATE TABLE native_hook_relay_bridges (
  relay_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  pid NUMBER NOT NULL,
  hostname VARCHAR2(4000) NOT NULL,
  port NUMBER NOT NULL,
  token VARCHAR2(4000) NOT NULL,
  expires_at_ms NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_native_hook_relay_bridges_expires
  ON native_hook_relay_bridges(expires_at_ms, relay_id);

CREATE TABLE model_capability_cache (
  provider_id VARCHAR2(4000) NOT NULL,
  model_id VARCHAR2(4000) NOT NULL,
  name VARCHAR2(4000) NOT NULL,
  input_text NUMBER NOT NULL,
  input_image NUMBER NOT NULL,
  reasoning NUMBER NOT NULL,
  supports_tools NUMBER,
  context_window NUMBER NOT NULL,
  max_tokens NUMBER NOT NULL,
  cost_input NUMBER NOT NULL,
  cost_output NUMBER NOT NULL,
  cost_cache_read NUMBER NOT NULL,
  cost_cache_write NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL,
  PRIMARY KEY (provider_id, model_id)
);

CREATE INDEX idx_model_capability_cache_provider_updated
  ON model_capability_cache(provider_id, updated_at_ms DESC, model_id);

CREATE TABLE agent_model_catalogs (
  catalog_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  agent_dir VARCHAR2(4000) NOT NULL,
  raw_json VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE INDEX idx_agent_model_catalogs_agent_dir
  ON agent_model_catalogs(agent_dir, updated_at DESC);

CREATE TABLE managed_outgoing_image_records (
  attachment_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  session_key VARCHAR2(4000) NOT NULL,
  message_id VARCHAR2(4000),
  created_at VARCHAR2(4000) NOT NULL,
  updated_at VARCHAR2(4000),
  retention_class VARCHAR2(4000),
  alt VARCHAR2(4000) NOT NULL,
  original_media_id VARCHAR2(4000) NOT NULL,
  original_media_subdir VARCHAR2(4000) NOT NULL,
  original_content_type VARCHAR2(4000) NOT NULL,
  original_width NUMBER,
  original_height NUMBER,
  original_size_bytes NUMBER,
  original_filename VARCHAR2(4000),
  record_json VARCHAR2(4000) NOT NULL
);

CREATE INDEX idx_managed_outgoing_images_session
  ON managed_outgoing_image_records(session_key, created_at DESC, attachment_id);

CREATE INDEX idx_managed_outgoing_images_message
  ON managed_outgoing_image_records(session_key, message_id, attachment_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE channel_pairing_requests (
  channel_key VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000) NOT NULL,
  request_id VARCHAR2(4000) NOT NULL,
  code VARCHAR2(4000) NOT NULL,
  created_at VARCHAR2(4000) NOT NULL,
  last_seen_at VARCHAR2(4000) NOT NULL,
  meta_json VARCHAR2(4000),
  PRIMARY KEY (channel_key, account_id, request_id)
);

CREATE INDEX idx_channel_pairing_requests_code
  ON channel_pairing_requests(channel_key, code);

CREATE INDEX idx_channel_pairing_requests_created
  ON channel_pairing_requests(channel_key, created_at, request_id);

CREATE TABLE channel_pairing_allow_entries (
  channel_key VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000) NOT NULL,
  entry VARCHAR2(4000) NOT NULL,
  sort_order NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  PRIMARY KEY (channel_key, account_id, entry)
);

CREATE INDEX idx_channel_pairing_allow_account
  ON channel_pairing_allow_entries(channel_key, account_id, sort_order, entry);

CREATE TABLE web_push_subscriptions (
  endpoint_hash VARCHAR2(255) NOT NULL PRIMARY KEY,
  subscription_id VARCHAR2(4000) NOT NULL UNIQUE,
  endpoint VARCHAR2(4000) NOT NULL,
  p256dh VARCHAR2(4000) NOT NULL,
  auth VARCHAR2(4000) NOT NULL,
  created_at_ms NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_web_push_subscriptions_updated
  ON web_push_subscriptions(updated_at_ms DESC, subscription_id);

CREATE TABLE web_push_vapid_keys (
  key_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  public_key VARCHAR2(4000) NOT NULL,
  private_key VARCHAR2(4000) NOT NULL,
  subject VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE apns_registrations (
  node_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  transport VARCHAR2(4000) NOT NULL,
  token VARCHAR2(4000),
  relay_handle VARCHAR2(4000),
  send_grant VARCHAR2(4000),
  installation_id VARCHAR2(4000),
  topic VARCHAR2(4000) NOT NULL,
  environment VARCHAR2(4000) NOT NULL,
  distribution VARCHAR2(4000),
  token_debug_suffix VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_apns_registrations_updated
  ON apns_registrations(updated_at_ms DESC, node_id);

CREATE TABLE node_host_config (
  config_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  version NUMBER NOT NULL,
  node_id VARCHAR2(4000) NOT NULL,
  token VARCHAR2(4000),
  display_name VARCHAR2(4000),
  gateway_host VARCHAR2(4000),
  gateway_port NUMBER,
  gateway_tls NUMBER,
  gateway_tls_fingerprint VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE voicewake_triggers (
  config_key VARCHAR2(4000) NOT NULL,
  position NUMBER NOT NULL,
  trigger VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL,
  PRIMARY KEY (config_key, position)
);

CREATE INDEX idx_voicewake_triggers_trigger
  ON voicewake_triggers(config_key, trigger);

CREATE TABLE voicewake_routing_config (
  config_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  version NUMBER NOT NULL,
  default_target_mode VARCHAR2(4000) NOT NULL,
  default_target_agent_id VARCHAR2(4000),
  default_target_session_key VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE voicewake_routing_routes (
  config_key VARCHAR2(4000) NOT NULL,
  position NUMBER NOT NULL,
  trigger VARCHAR2(4000) NOT NULL,
  target_mode VARCHAR2(4000) NOT NULL,
  target_agent_id VARCHAR2(4000),
  target_session_key VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL,
  PRIMARY KEY (config_key, position),
  FOREIGN KEY (config_key) REFERENCES voicewake_routing_config(config_key) ON DELETE CASCADE
);

CREATE INDEX idx_voicewake_routing_routes_trigger
  ON voicewake_routing_routes(config_key, trigger);

CREATE TABLE update_check_state (
  state_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  last_checked_at VARCHAR2(4000),
  last_notified_version VARCHAR2(4000),
  last_notified_tag VARCHAR2(4000),
  last_available_version VARCHAR2(4000),
  last_available_tag VARCHAR2(4000),
  auto_install_id VARCHAR2(4000),
  auto_first_seen_version VARCHAR2(4000),
  auto_first_seen_tag VARCHAR2(4000),
  auto_first_seen_at VARCHAR2(4000),
  auto_last_attempt_version VARCHAR2(4000),
  auto_last_attempt_at VARCHAR2(4000),
  auto_last_success_version VARCHAR2(4000),
  auto_last_success_at VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE config_health_entries (
  config_path VARCHAR2(255) NOT NULL PRIMARY KEY,
  last_known_good_json VARCHAR2(4000),
  last_promoted_good_json VARCHAR2(4000),
  last_observed_suspicious_signature VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE installed_plugin_index (
  index_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  version NUMBER NOT NULL,
  host_contract_version VARCHAR2(4000) NOT NULL,
  compat_registry_version VARCHAR2(4000) NOT NULL,
  migration_version NUMBER NOT NULL,
  policy_hash VARCHAR2(4000) NOT NULL,
  generated_at_ms NUMBER NOT NULL,
  refresh_reason VARCHAR2(4000),
  install_records_json VARCHAR2(4000) NOT NULL,
  plugins_json VARCHAR2(4000) NOT NULL,
  diagnostics_json VARCHAR2(4000) NOT NULL,
  warning VARCHAR2(4000),
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_installed_plugin_index_generated
  ON installed_plugin_index(generated_at_ms DESC, index_key);

CREATE TABLE official_external_plugin_catalog_snapshots (
  feed_url VARCHAR2(255) NOT NULL PRIMARY KEY,
  body VARCHAR2(4000) NOT NULL,
  status NUMBER NOT NULL,
  etag VARCHAR2(4000),
  last_modified VARCHAR2(4000),
  checksum VARCHAR2(4000) NOT NULL,
  saved_at VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_official_external_plugin_catalog_snapshots_updated
  ON official_external_plugin_catalog_snapshots(updated_at_ms DESC, feed_url);

CREATE TABLE gateway_restart_sentinel (
  sentinel_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  version NUMBER NOT NULL,
  kind VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  ts NUMBER NOT NULL,
  session_key VARCHAR2(4000),
  thread_id VARCHAR2(4000),
  delivery_channel VARCHAR2(4000),
  delivery_to VARCHAR2(4000),
  delivery_account_id VARCHAR2(4000),
  message VARCHAR2(4000),
  continuation_json VARCHAR2(4000),
  doctor_hint VARCHAR2(4000),
  stats_json VARCHAR2(4000),
  payload_json VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_gateway_restart_sentinel_ts
  ON gateway_restart_sentinel(ts DESC, sentinel_key);

CREATE TABLE gateway_restart_intent (
  intent_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  kind VARCHAR2(4000) NOT NULL,
  pid NUMBER NOT NULL,
  created_at NUMBER NOT NULL,
  reason VARCHAR2(4000),
  force NUMBER,
  wait_ms NUMBER,
  updated_at_ms NUMBER NOT NULL
);

CREATE TABLE gateway_restart_handoff (
  handoff_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  kind VARCHAR2(4000) NOT NULL,
  version NUMBER NOT NULL,
  intent_id VARCHAR2(4000) NOT NULL,
  pid NUMBER NOT NULL,
  process_instance_id VARCHAR2(4000),
  created_at NUMBER NOT NULL,
  expires_at NUMBER NOT NULL,
  reason VARCHAR2(4000),
  restart_trace_started_at NUMBER,
  restart_trace_last_at NUMBER,
  source VARCHAR2(4000) NOT NULL,
  restart_kind VARCHAR2(4000) NOT NULL,
  supervisor_mode VARCHAR2(4000) NOT NULL,
  updated_at_ms NUMBER NOT NULL
);

CREATE INDEX idx_gateway_restart_handoff_expiry
  ON gateway_restart_handoff(expires_at, pid);

CREATE TABLE acp_sessions (
  session_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  session_id VARCHAR2(4000),
  backend VARCHAR2(4000) NOT NULL,
  agent VARCHAR2(4000) NOT NULL,
  runtime_session_name VARCHAR2(4000) NOT NULL,
  identity_json VARCHAR2(4000),
  mode VARCHAR2(4000) NOT NULL,
  runtime_options_json VARCHAR2(4000),
  cwd VARCHAR2(4000),
  state VARCHAR2(4000) NOT NULL,
  last_activity_at NUMBER NOT NULL,
  last_error VARCHAR2(4000),
  updated_at NUMBER NOT NULL
);

CREATE INDEX idx_acp_sessions_state_activity
  ON acp_sessions(state, last_activity_at DESC, session_key);

CREATE INDEX idx_acp_sessions_agent_activity
  ON acp_sessions(agent, last_activity_at DESC, session_key);

CREATE TABLE acp_replay_sessions (
  session_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  session_key VARCHAR2(4000) NOT NULL,
  cwd VARCHAR2(4000) NOT NULL,
  complete NUMBER NOT NULL,
  created_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  next_seq NUMBER NOT NULL
);

CREATE INDEX idx_acp_replay_sessions_key_updated
  ON acp_replay_sessions(session_key, complete, updated_at DESC, session_id);

CREATE INDEX idx_acp_replay_sessions_updated
  ON acp_replay_sessions(updated_at DESC, session_id);

CREATE TABLE acp_replay_events (
  session_id VARCHAR2(4000) NOT NULL,
  seq NUMBER NOT NULL,
  at NUMBER NOT NULL,
  session_key VARCHAR2(4000) NOT NULL,
  run_id VARCHAR2(4000),
  update_json VARCHAR2(4000) NOT NULL,
  PRIMARY KEY (session_id, seq),
  FOREIGN KEY (session_id) REFERENCES acp_replay_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX idx_acp_replay_events_session_seq
  ON acp_replay_events(session_id, seq);

CREATE TABLE agent_databases (
  agent_id VARCHAR2(4000) NOT NULL,
  path VARCHAR2(4000) NOT NULL,
  schema_version NUMBER NOT NULL,
  last_seen_at NUMBER NOT NULL,
  size_bytes NUMBER,
  PRIMARY KEY (agent_id, path)
);

CREATE TABLE plugin_state_entries (
  plugin_id VARCHAR2(4000) NOT NULL,
  namespace VARCHAR2(4000) NOT NULL,
  entry_key VARCHAR2(4000) NOT NULL,
  value_json VARCHAR2(4000) NOT NULL,
  created_at NUMBER NOT NULL,
  expires_at NUMBER,
  PRIMARY KEY (plugin_id, namespace, entry_key)
);

CREATE INDEX idx_plugin_state_expiry
  ON plugin_state_entries(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX idx_plugin_state_listing
  ON plugin_state_entries(plugin_id, namespace, created_at, entry_key);

CREATE TABLE channel_ingress_events (
  queue_name VARCHAR2(4000) NOT NULL,
  event_id VARCHAR2(4000) NOT NULL,
  channel_id VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  lane_key VARCHAR2(4000),
  payload_json VARCHAR2(4000) NOT NULL,
  metadata_json VARCHAR2(4000),
  received_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  claim_token VARCHAR2(4000),
  claim_owner VARCHAR2(4000),
  claimed_at NUMBER,
  attempts NUMBER NOT NULL DEFAULT 0,
  last_attempt_at NUMBER,
  last_error VARCHAR2(4000),
  failed_reason VARCHAR2(4000),
  failed_at NUMBER,
  completed_at NUMBER,
  completed_metadata_json VARCHAR2(4000),
  PRIMARY KEY (queue_name, event_id)
);

CREATE INDEX idx_channel_ingress_pending
  ON channel_ingress_events(queue_name, status, received_at, event_id);

CREATE INDEX idx_channel_ingress_claims
  ON channel_ingress_events(queue_name, status, claimed_at);

CREATE INDEX idx_channel_ingress_lane
  ON channel_ingress_events(queue_name, status, lane_key);

CREATE TABLE plugin_blob_entries (
  plugin_id VARCHAR2(4000) NOT NULL,
  namespace VARCHAR2(4000) NOT NULL,
  entry_key VARCHAR2(4000) NOT NULL,
  metadata_json VARCHAR2(4000) NOT NULL,
  blob BLOB NOT NULL,
  created_at NUMBER NOT NULL,
  expires_at NUMBER,
  PRIMARY KEY (plugin_id, namespace, entry_key)
);

CREATE INDEX idx_plugin_blob_expiry
  ON plugin_blob_entries(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX idx_plugin_blob_listing
  ON plugin_blob_entries(plugin_id, namespace, created_at, entry_key);

CREATE TABLE media_blobs (
  subdir VARCHAR2(4000) NOT NULL,
  id VARCHAR2(4000) NOT NULL,
  content_type VARCHAR2(4000),
  size_bytes NUMBER NOT NULL,
  blob BLOB NOT NULL,
  created_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  PRIMARY KEY (subdir, id)
);

CREATE INDEX idx_media_blobs_created
  ON media_blobs(created_at);

CREATE TABLE skill_uploads (
  upload_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  kind VARCHAR2(4000) NOT NULL,
  slug VARCHAR2(4000) NOT NULL,
  force NUMBER NOT NULL,
  size_bytes NUMBER NOT NULL,
  sha256 VARCHAR2(4000),
  actual_sha256 VARCHAR2(4000),
  received_bytes NUMBER NOT NULL,
  archive_blob BLOB NOT NULL,
  created_at NUMBER NOT NULL,
  expires_at NUMBER NOT NULL,
  committed NUMBER NOT NULL,
  committed_at NUMBER,
  idempotency_key_hash TEXT UNIQUE
);

CREATE INDEX idx_skill_uploads_expiry
  ON skill_uploads(expires_at);

CREATE INDEX idx_skill_uploads_idempotency
  ON skill_uploads(idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE TABLE capture_sessions (
  id VARCHAR2(255) NOT NULL PRIMARY KEY,
  started_at NUMBER NOT NULL,
  ended_at NUMBER,
  mode VARCHAR2(4000) NOT NULL,
  source_scope VARCHAR2(4000) NOT NULL,
  source_process VARCHAR2(4000) NOT NULL,
  proxy_url TEXT
);

CREATE TABLE capture_blobs (
  blob_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  content_type VARCHAR2(4000),
  encoding VARCHAR2(4000) NOT NULL,
  size_bytes NUMBER NOT NULL,
  sha256 VARCHAR2(4000) NOT NULL,
  data BLOB NOT NULL,
  created_at NUMBER NOT NULL
);

CREATE TABLE capture_events (
  id NUMBER NOT NULL PRIMARY KEY,
  session_id VARCHAR2(4000) NOT NULL,
  ts NUMBER NOT NULL,
  source_scope VARCHAR2(4000) NOT NULL,
  source_process VARCHAR2(4000) NOT NULL,
  protocol VARCHAR2(4000) NOT NULL,
  direction VARCHAR2(4000) NOT NULL,
  kind VARCHAR2(4000) NOT NULL,
  flow_id VARCHAR2(4000) NOT NULL,
  method VARCHAR2(4000),
  host VARCHAR2(4000),
  path VARCHAR2(4000),
  status NUMBER,
  close_code NUMBER,
  content_type VARCHAR2(4000),
  headers_json VARCHAR2(4000),
  data_text VARCHAR2(4000),
  data_blob_id VARCHAR2(4000),
  data_sha256 VARCHAR2(4000),
  error_text VARCHAR2(4000),
  meta_json VARCHAR2(4000),
  FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (data_blob_id) REFERENCES capture_blobs(blob_id) ON DELETE SET NULL
);

CREATE INDEX capture_events_session_ts_idx
  ON capture_events(session_id, ts);

CREATE INDEX capture_events_flow_idx
  ON capture_events(flow_id, ts);

CREATE TABLE sandbox_registry_entries (
  registry_kind VARCHAR2(4000) NOT NULL,
  container_name VARCHAR2(4000) NOT NULL,
  session_key VARCHAR2(4000),
  backend_id VARCHAR2(4000),
  runtime_label VARCHAR2(4000),
  image VARCHAR2(4000),
  created_at_ms NUMBER,
  last_used_at_ms NUMBER,
  config_label_kind VARCHAR2(4000),
  config_hash VARCHAR2(4000),
  cdp_port NUMBER,
  no_vnc_port NUMBER,
  entry_json VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL,
  PRIMARY KEY (registry_kind, container_name)
);

CREATE INDEX idx_sandbox_registry_updated
  ON sandbox_registry_entries(registry_kind, updated_at DESC, container_name);

CREATE INDEX idx_sandbox_registry_session
  ON sandbox_registry_entries(registry_kind, session_key, last_used_at_ms DESC, container_name)
  WHERE session_key IS NOT NULL;

CREATE INDEX idx_sandbox_registry_last_used
  ON sandbox_registry_entries(registry_kind, last_used_at_ms DESC, container_name)
  WHERE last_used_at_ms IS NOT NULL;

CREATE TABLE commitments (
  id VARCHAR2(255) NOT NULL PRIMARY KEY,
  agent_id VARCHAR2(4000) NOT NULL,
  session_key VARCHAR2(4000) NOT NULL,
  channel VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000),
  recipient_id VARCHAR2(4000),
  thread_id VARCHAR2(4000),
  sender_id VARCHAR2(4000),
  kind VARCHAR2(4000) NOT NULL,
  sensitivity VARCHAR2(4000) NOT NULL,
  source VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  reason VARCHAR2(4000) NOT NULL,
  suggested_text VARCHAR2(4000) NOT NULL,
  dedupe_key VARCHAR2(4000) NOT NULL,
  confidence NUMBER NOT NULL,
  due_earliest_ms NUMBER NOT NULL,
  due_latest_ms NUMBER NOT NULL,
  due_timezone VARCHAR2(4000) NOT NULL,
  source_message_id VARCHAR2(4000),
  source_run_id VARCHAR2(4000),
  created_at_ms NUMBER NOT NULL,
  updated_at_ms NUMBER NOT NULL,
  attempts NUMBER NOT NULL,
  last_attempt_at_ms NUMBER,
  sent_at_ms NUMBER,
  dismissed_at_ms NUMBER,
  snoozed_until_ms NUMBER,
  expired_at_ms NUMBER,
  record_json VARCHAR2(4000) NOT NULL
);

CREATE INDEX idx_commitments_scope_due
  ON commitments(agent_id, session_key, status, due_earliest_ms, due_latest_ms);

CREATE INDEX idx_commitments_status_due
  ON commitments(status, due_earliest_ms, due_latest_ms);

CREATE INDEX idx_commitments_scope_dedupe
  ON commitments(agent_id, session_key, channel, dedupe_key, status);

CREATE TABLE cron_run_logs (
  store_key VARCHAR2(4000) NOT NULL,
  job_id VARCHAR2(4000) NOT NULL,
  seq NUMBER NOT NULL,
  ts NUMBER NOT NULL,
  status VARCHAR2(4000),
  error VARCHAR2(4000),
  summary VARCHAR2(4000),
  diagnostics_summary VARCHAR2(4000),
  delivery_status VARCHAR2(4000),
  delivery_error VARCHAR2(4000),
  delivered NUMBER,
  session_id VARCHAR2(4000),
  session_key VARCHAR2(4000),
  run_id VARCHAR2(4000),
  run_at_ms NUMBER,
  duration_ms NUMBER,
  next_run_at_ms NUMBER,
  model VARCHAR2(4000),
  provider VARCHAR2(4000),
  total_tokens NUMBER,
  entry_json VARCHAR2(4000) NOT NULL,
  created_at NUMBER NOT NULL,
  PRIMARY KEY (store_key, job_id, seq)
);

CREATE INDEX idx_cron_run_logs_store_ts
  ON cron_run_logs(store_key, ts DESC, seq DESC);

CREATE INDEX idx_cron_run_logs_job_status
  ON cron_run_logs(store_key, job_id, status, ts DESC, seq DESC);

CREATE INDEX idx_cron_run_logs_delivery
  ON cron_run_logs(store_key, delivery_status, ts DESC, seq DESC)
  WHERE delivery_status IS NOT NULL;

CREATE TABLE cron_jobs (
  store_key VARCHAR2(4000) NOT NULL,
  job_id VARCHAR2(4000) NOT NULL,
  name VARCHAR2(4000) NOT NULL,
  description VARCHAR2(4000),
  enabled NUMBER NOT NULL,
  delete_after_run NUMBER,
  created_at_ms NUMBER NOT NULL,
  agent_id VARCHAR2(4000),
  session_key VARCHAR2(4000),
  schedule_kind VARCHAR2(4000) NOT NULL,
  schedule_expr VARCHAR2(4000),
  schedule_tz VARCHAR2(4000),
  every_ms NUMBER,
  anchor_ms NUMBER,
  at VARCHAR2(4000),
  stagger_ms NUMBER,
  session_target VARCHAR2(4000) NOT NULL,
  wake_mode VARCHAR2(4000) NOT NULL,
  payload_kind VARCHAR2(4000) NOT NULL,
  payload_message VARCHAR2(4000),
  payload_model VARCHAR2(4000),
  payload_fallbacks_json VARCHAR2(4000),
  payload_thinking VARCHAR2(4000),
  payload_timeout_seconds NUMBER,
  payload_allow_unsafe_external_content NUMBER,
  payload_external_content_source_json VARCHAR2(4000),
  payload_light_context NUMBER,
  payload_tools_allow_json VARCHAR2(4000),
  payload_tools_allow_is_default NUMBER,
  delivery_mode VARCHAR2(4000),
  delivery_channel VARCHAR2(4000),
  delivery_to VARCHAR2(4000),
  delivery_thread_id VARCHAR2(4000),
  delivery_account_id VARCHAR2(4000),
  delivery_best_effort NUMBER,
  delivery_completion_mode VARCHAR2(4000),
  delivery_completion_to VARCHAR2(4000),
  failure_delivery_mode VARCHAR2(4000),
  failure_delivery_channel VARCHAR2(4000),
  failure_delivery_to VARCHAR2(4000),
  failure_delivery_account_id VARCHAR2(4000),
  failure_alert_disabled NUMBER,
  failure_alert_after NUMBER,
  failure_alert_channel VARCHAR2(4000),
  failure_alert_to VARCHAR2(4000),
  failure_alert_cooldown_ms NUMBER,
  failure_alert_include_skipped NUMBER,
  failure_alert_mode VARCHAR2(4000),
  failure_alert_account_id VARCHAR2(4000),
  next_run_at_ms NUMBER,
  running_at_ms NUMBER,
  last_run_at_ms NUMBER,
  last_run_status VARCHAR2(4000),
  last_error VARCHAR2(4000),
  last_duration_ms NUMBER,
  consecutive_errors NUMBER,
  consecutive_skipped NUMBER,
  schedule_error_count NUMBER,
  last_delivery_status VARCHAR2(4000),
  last_delivery_error VARCHAR2(4000),
  last_delivered NUMBER,
  last_failure_alert_at_ms NUMBER,
  job_json VARCHAR2(4000) NOT NULL,
  state_json VARCHAR2(4000) NOT NULL DEFAULT '{}',
  runtime_updated_at_ms NUMBER,
  schedule_identity VARCHAR2(4000),
  sort_order NUMBER NOT NULL DEFAULT 0,
  updated_at NUMBER NOT NULL,
  PRIMARY KEY (store_key, job_id)
);

CREATE INDEX idx_cron_jobs_store_updated
  ON cron_jobs(store_key, sort_order ASC, updated_at DESC, job_id);

CREATE INDEX idx_cron_jobs_store_order
  ON cron_jobs(store_key, sort_order ASC, updated_at ASC, job_id);

CREATE INDEX idx_cron_jobs_enabled_next_run
  ON cron_jobs(store_key, enabled, next_run_at_ms, job_id)
  WHERE next_run_at_ms IS NOT NULL;

CREATE INDEX idx_cron_jobs_agent_session
  ON cron_jobs(agent_id, session_key, updated_at DESC, job_id)
  WHERE agent_id IS NOT NULL OR session_key IS NOT NULL;

CREATE TABLE command_log_entries (
  id VARCHAR2(255) NOT NULL PRIMARY KEY,
  timestamp_ms NUMBER NOT NULL,
  action VARCHAR2(4000) NOT NULL,
  session_key VARCHAR2(4000) NOT NULL,
  sender_id VARCHAR2(4000) NOT NULL,
  source VARCHAR2(4000) NOT NULL,
  entry_json VARCHAR2(4000) NOT NULL
);

CREATE INDEX idx_command_log_entries_timestamp
  ON command_log_entries(timestamp_ms DESC, id);

CREATE INDEX idx_command_log_entries_session
  ON command_log_entries(session_key, timestamp_ms DESC, id);

CREATE TABLE delivery_queue_entries (
  queue_name VARCHAR2(4000) NOT NULL,
  id VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  entry_kind VARCHAR2(4000),
  session_key VARCHAR2(4000),
  channel VARCHAR2(4000),
  target VARCHAR2(4000),
  account_id VARCHAR2(4000),
  retry_count NUMBER NOT NULL DEFAULT 0,
  last_attempt_at NUMBER,
  last_error VARCHAR2(4000),
  recovery_state VARCHAR2(4000),
  platform_send_started_at NUMBER,
  entry_json VARCHAR2(4000) NOT NULL,
  enqueued_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  failed_at NUMBER,
  PRIMARY KEY (queue_name, id)
);

CREATE INDEX idx_delivery_queue_pending
  ON delivery_queue_entries(queue_name, status, enqueued_at, id);

CREATE INDEX idx_delivery_queue_failed
  ON delivery_queue_entries(queue_name, status, failed_at, id);

CREATE INDEX idx_delivery_queue_session
  ON delivery_queue_entries(queue_name, status, session_key, enqueued_at, id)
  WHERE session_key IS NOT NULL;

CREATE INDEX idx_delivery_queue_target
  ON delivery_queue_entries(queue_name, status, channel, target, enqueued_at, id)
  WHERE channel IS NOT NULL AND target IS NOT NULL;

CREATE TABLE task_runs (
  task_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  runtime VARCHAR2(4000) NOT NULL,
  task_kind VARCHAR2(4000),
  source_id VARCHAR2(4000),
  requester_session_key VARCHAR2(4000),
  owner_key VARCHAR2(4000) NOT NULL,
  scope_kind VARCHAR2(4000) NOT NULL,
  child_session_key VARCHAR2(4000),
  parent_flow_id VARCHAR2(4000),
  parent_task_id VARCHAR2(4000),
  agent_id VARCHAR2(4000),
  requester_agent_id VARCHAR2(4000),
  run_id VARCHAR2(4000),
  label VARCHAR2(4000),
  task VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  delivery_status VARCHAR2(4000) NOT NULL,
  notify_policy VARCHAR2(4000) NOT NULL,
  created_at NUMBER NOT NULL,
  started_at NUMBER,
  ended_at NUMBER,
  last_event_at NUMBER,
  cleanup_after NUMBER,
  error VARCHAR2(4000),
  progress_summary VARCHAR2(4000),
  terminal_summary VARCHAR2(4000),
  terminal_outcome TEXT
);

CREATE INDEX idx_task_runs_run_id ON task_runs(run_id);
CREATE INDEX idx_task_runs_status ON task_runs(status);
CREATE INDEX idx_task_runs_runtime_status ON task_runs(runtime, status);
CREATE INDEX idx_task_runs_cleanup_after ON task_runs(cleanup_after);
CREATE INDEX idx_task_runs_last_event_at ON task_runs(last_event_at);
CREATE INDEX idx_task_runs_owner_key ON task_runs(owner_key);
CREATE INDEX idx_task_runs_parent_flow_id ON task_runs(parent_flow_id);
CREATE INDEX idx_task_runs_child_session_key ON task_runs(child_session_key);

CREATE TABLE subagent_runs (
  run_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  child_session_key VARCHAR2(4000) NOT NULL,
  controller_session_key VARCHAR2(4000),
  requester_session_key VARCHAR2(4000) NOT NULL,
  requester_display_key VARCHAR2(4000) NOT NULL,
  requester_origin_json VARCHAR2(4000),
  task VARCHAR2(4000) NOT NULL,
  task_name VARCHAR2(4000),
  cleanup VARCHAR2(4000) NOT NULL,
  label VARCHAR2(4000),
  model VARCHAR2(4000),
  agent_dir VARCHAR2(4000),
  workspace_dir VARCHAR2(4000),
  run_timeout_seconds NUMBER,
  spawn_mode VARCHAR2(4000),
  created_at NUMBER NOT NULL,
  started_at NUMBER,
  session_started_at NUMBER,
  accumulated_runtime_ms NUMBER,
  ended_at NUMBER,
  outcome_json VARCHAR2(4000),
  archive_at_ms NUMBER,
  cleanup_completed_at NUMBER,
  cleanup_handled NUMBER,
  suppress_announce_reason VARCHAR2(4000),
  expects_completion_message NUMBER,
  announce_retry_count NUMBER,
  last_announce_retry_at NUMBER,
  last_announce_delivery_error VARCHAR2(4000),
  ended_reason VARCHAR2(4000),
  pause_reason VARCHAR2(4000),
  wake_on_descendant_settle NUMBER,
  frozen_result_text VARCHAR2(4000),
  frozen_result_captured_at NUMBER,
  fallback_frozen_result_text VARCHAR2(4000),
  fallback_frozen_result_captured_at NUMBER,
  ended_hook_emitted_at NUMBER,
  pending_final_delivery NUMBER,
  pending_final_delivery_created_at NUMBER,
  pending_final_delivery_last_attempt_at NUMBER,
  pending_final_delivery_attempt_count NUMBER,
  pending_final_delivery_last_error VARCHAR2(4000),
  pending_final_delivery_payload_json VARCHAR2(4000),
  completion_announced_at NUMBER,
  payload_json VARCHAR2(4000) NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_subagent_runs_child_session_key
  ON subagent_runs(child_session_key, created_at DESC, run_id);
CREATE INDEX idx_subagent_runs_requester_session_key
  ON subagent_runs(requester_session_key, created_at DESC, run_id);
CREATE INDEX idx_subagent_runs_controller_session_key
  ON subagent_runs(controller_session_key, created_at DESC, run_id);
CREATE INDEX idx_subagent_runs_archive_at
  ON subagent_runs(archive_at_ms, cleanup_handled, run_id);
CREATE INDEX idx_subagent_runs_ended_cleanup
  ON subagent_runs(ended_at, cleanup_handled, run_id);

CREATE TABLE current_conversation_bindings (
  binding_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  binding_id VARCHAR2(4000) NOT NULL,
  target_agent_id VARCHAR2(4000) NOT NULL,
  target_session_id VARCHAR2(4000),
  target_session_key VARCHAR2(4000) NOT NULL,
  channel VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000) NOT NULL,
  conversation_kind VARCHAR2(4000) NOT NULL,
  parent_conversation_id VARCHAR2(4000),
  conversation_id VARCHAR2(4000) NOT NULL,
  target_kind VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  bound_at NUMBER NOT NULL,
  expires_at NUMBER,
  metadata_json VARCHAR2(4000),
  record_json VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE INDEX idx_current_conversation_bindings_target
  ON current_conversation_bindings(target_agent_id, target_session_key, updated_at DESC, binding_key);
CREATE INDEX idx_current_conversation_bindings_conversation
  ON current_conversation_bindings(channel, account_id, conversation_kind, conversation_id);
CREATE INDEX idx_current_conversation_bindings_expires
  ON current_conversation_bindings(expires_at, binding_key);

CREATE TABLE plugin_binding_approvals (
  plugin_root VARCHAR2(4000) NOT NULL,
  channel VARCHAR2(4000) NOT NULL,
  account_id VARCHAR2(4000) NOT NULL,
  plugin_id VARCHAR2(4000) NOT NULL,
  plugin_name VARCHAR2(4000),
  approved_at NUMBER NOT NULL,
  PRIMARY KEY (plugin_root, channel, account_id)
);

CREATE INDEX idx_plugin_binding_approvals_plugin
  ON plugin_binding_approvals(plugin_id, approved_at DESC);

CREATE TABLE tui_last_sessions (
  scope_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  session_key VARCHAR2(4000) NOT NULL,
  updated_at NUMBER NOT NULL
);

CREATE INDEX idx_tui_last_sessions_session_key
  ON tui_last_sessions(session_key, updated_at DESC, scope_key);

CREATE TABLE task_delivery_state (
  task_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  requester_origin_json VARCHAR2(4000),
  last_notified_event_at NUMBER,
  FOREIGN KEY (task_id) REFERENCES task_runs(task_id) ON DELETE CASCADE
);

CREATE TABLE flow_runs (
  flow_id VARCHAR2(255) NOT NULL PRIMARY KEY,
  shape VARCHAR2(4000),
  sync_mode VARCHAR2(4000) NOT NULL DEFAULT 'managed',
  owner_key VARCHAR2(4000) NOT NULL,
  requester_origin_json VARCHAR2(4000),
  controller_id VARCHAR2(4000),
  revision NUMBER NOT NULL DEFAULT 0,
  status VARCHAR2(4000) NOT NULL,
  notify_policy VARCHAR2(4000) NOT NULL,
  goal VARCHAR2(4000) NOT NULL,
  current_step VARCHAR2(4000),
  blocked_task_id VARCHAR2(4000),
  blocked_summary VARCHAR2(4000),
  state_json VARCHAR2(4000),
  wait_json VARCHAR2(4000),
  cancel_requested_at NUMBER,
  created_at NUMBER NOT NULL,
  updated_at NUMBER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX idx_flow_runs_status ON flow_runs(status);
CREATE INDEX idx_flow_runs_owner_key ON flow_runs(owner_key);
CREATE INDEX idx_flow_runs_updated_at ON flow_runs(updated_at);

CREATE TABLE migration_runs (
  id VARCHAR2(255) NOT NULL PRIMARY KEY,
  started_at NUMBER NOT NULL,
  finished_at NUMBER,
  status VARCHAR2(4000) NOT NULL,
  report_json VARCHAR2(4000) NOT NULL
);

CREATE INDEX idx_migration_runs_started
  ON migration_runs(started_at DESC, id);

CREATE TABLE migration_sources (
  source_key VARCHAR2(255) NOT NULL PRIMARY KEY,
  migration_kind VARCHAR2(4000) NOT NULL,
  source_path VARCHAR2(4000) NOT NULL,
  target_table VARCHAR2(4000) NOT NULL,
  source_sha256 VARCHAR2(4000),
  source_size_bytes NUMBER,
  source_record_count NUMBER,
  last_run_id VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  imported_at NUMBER NOT NULL,
  removed_source NUMBER NOT NULL DEFAULT 0,
  report_json VARCHAR2(4000) NOT NULL,
  FOREIGN KEY (last_run_id) REFERENCES migration_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_migration_sources_path
  ON migration_sources(source_path, migration_kind, target_table);

CREATE INDEX idx_migration_sources_run
  ON migration_sources(last_run_id, source_path);

CREATE TABLE backup_runs (
  id VARCHAR2(255) NOT NULL PRIMARY KEY,
  created_at NUMBER NOT NULL,
  archive_path VARCHAR2(4000) NOT NULL,
  status VARCHAR2(4000) NOT NULL,
  manifest_json VARCHAR2(4000) NOT NULL
);

CREATE INDEX idx_backup_runs_created
  ON backup_runs(created_at DESC, id);