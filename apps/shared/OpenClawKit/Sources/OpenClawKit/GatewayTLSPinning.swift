import CryptoKit
import Foundation
import Security

public struct GatewayTLSParams: Sendable {
  public let required: Bool
  public let expectedFingerprint: String?
  public let allowTOFU: Bool
  public let storeKey: String?

  public init(required: Bool, expectedFingerprint: String?, allowTOFU: Bool, storeKey: String?) {
    self.required = required
    self.expectedFingerprint = expectedFingerprint
    self.allowTOFU = allowTOFU
    self.storeKey = storeKey
  }
}

public enum GatewayTLSValidationFailureKind: String, Sendable {
  case pinMismatch
  case certificateUnavailable
  case untrustedCertificate
}

public struct GatewayTLSValidationFailure: Equatable, Sendable {
  public let kind: GatewayTLSValidationFailureKind
  public let host: String
  public let storeKey: String?
  public let expectedFingerprint: String?
  public let observedFingerprint: String?
  public let systemTrustOk: Bool

  public init(
    kind: GatewayTLSValidationFailureKind,
    host: String,
    storeKey: String?,
    expectedFingerprint: String?,
    observedFingerprint: String?,
    systemTrustOk: Bool
  ) {
    self.kind = kind
    self.host = host
    self.storeKey = storeKey
    self.expectedFingerprint = expectedFingerprint
    self.observedFingerprint = observedFingerprint
    self.systemTrustOk = systemTrustOk
  }
}

public struct GatewayTLSValidationError: LocalizedError, Sendable {
  public let failure: GatewayTLSValidationFailure
  public let context: String

  public init(failure: GatewayTLSValidationFailure, context: String) {
    self.failure = failure
    self.context = context
  }

  public var errorDescription: String? {
    let prefix = self.context.trimmingCharacters(in: .whitespacesAndNewlines)
    switch self.failure.kind {
    case .pinMismatch:
      let expected = self.failure.expectedFingerprint ?? "unknown"
      let observed = self.failure.observedFingerprint ?? "unknown"
      return
        "\(prefix): TLS certificate pin mismatch for \(self.failure.host) (expected \(expected), observed \(observed))"
    case .certificateUnavailable:
      return "\(prefix): TLS certificate unavailable for \(self.failure.host)"
    case .untrustedCertificate:
      return "\(prefix): TLS certificate is not trusted for \(self.failure.host)"
    }
  }
}

public protocol GatewayTLSFailureProviding: AnyObject {
  func consumeLastTLSFailure() -> GatewayTLSValidationFailure?
}

public protocol GatewayDeviceTokenRetryTrustProviding: AnyObject {
  var allowsDeviceTokenRetryAuth: Bool { get }
}

enum GatewayTLSFirstUsePolicy {
  static func allowsFirstUsePin(systemTrustOk: Bool) -> Bool {
    systemTrustOk
  }
}

public enum GatewayTLSStore {
  private static let keychainService = "ai.openclaw.tls-pinning"

  public static func loadFingerprint(stableID: String) -> String? {
    self.migrateFromUserDefaultsIfNeeded(stableID: stableID)
    let raw = GenericPasswordKeychainStore.loadString(
      service: self.keychainService, account: stableID)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if raw?.isEmpty == false { return raw }
    return nil
  }

  public static func saveFingerprint(_ value: String, stableID: String) {
    _ = GenericPasswordKeychainStore.saveString(
      value, service: self.keychainService, account: stableID)
  }

  @discardableResult
  public static func replaceFingerprint(_ value: String, stableID: String) -> Bool {
    guard
      GenericPasswordKeychainStore.saveString(
        value, service: self.keychainService, account: stableID)
    else {
      return false
    }
    return true
  }

  @discardableResult
  public static func clearFingerprint(stableID: String) -> Bool {
    let removedKeychain = GenericPasswordKeychainStore.delete(
      service: self.keychainService,
      account: stableID)
    return removedKeychain
  }

  @discardableResult
  public static func clearAllFingerprints() -> Bool {
    let removedKeychain = SecItemDelete(
      [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: self.keychainService,
      ] as CFDictionary)
    return removedKeychain == errSecSuccess || removedKeychain == errSecItemNotFound
  }
}

public final class GatewayTLSPinningSession: NSObject, WebSocketSessioning, URLSessionDelegate,
  GatewayTLSFailureProviding, GatewayDeviceTokenRetryTrustProviding, @unchecked Sendable
{
  private let params: GatewayTLSParams
  private let failureLock = NSLock()
  private var lastTLSFailure: GatewayTLSValidationFailure?
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.default
    config.waitsForConnectivity = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  public init(params: GatewayTLSParams) {
    self.params = params
    super.init()
  }

  public var allowsDeviceTokenRetryAuth: Bool {
    self.params.expectedFingerprint?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      == false
  }

  public func consumeLastTLSFailure() -> GatewayTLSValidationFailure? {
    self.failureLock.lock()
    defer { self.failureLock.unlock() }
    let failure = self.lastTLSFailure
    self.lastTLSFailure = nil
    return failure
  }

  private func recordTLSFailure(_ failure: GatewayTLSValidationFailure) {
    self.failureLock.lock()
    self.lastTLSFailure = failure
    self.failureLock.unlock()
  }

  private func clearTLSFailure() {
    self.failureLock.lock()
    self.lastTLSFailure = nil
    self.failureLock.unlock()
  }

  public func makeWebSocketTask(url: URL) -> WebSocketTaskBox {
    let task = self.session.webSocketTask(with: url)
    task.maximumMessageSize = 16 * 1024 * 1024
    return WebSocketTaskBox(task: task)
  }

  public func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let trust = challenge.protectionSpace.serverTrust
    else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    let host = challenge.protectionSpace.host
    let systemTrustOk = SecTrustEvaluateWithError(trust, nil)
    let expected = self.params.expectedFingerprint.map(normalizeFingerprint)
    let fingerprint = certificateFingerprint(trust)
    if let fingerprint {
      if let expected {
        if fingerprint == expected {
          self.clearTLSFailure()
          completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
          self.recordTLSFailure(
            GatewayTLSValidationFailure(
              kind: .pinMismatch,
              host: host,
              storeKey: self.params.storeKey,
              expectedFingerprint: expected,
              observedFingerprint: fingerprint,
              systemTrustOk: systemTrustOk))
          completionHandler(.cancelAuthenticationChallenge, nil)
        }
        return
      }
      if self.params.allowTOFU {
        if GatewayTLSFirstUsePolicy.allowsFirstUsePin(systemTrustOk: systemTrustOk) {
          if let storeKey = params.storeKey {
            GatewayTLSStore.saveFingerprint(fingerprint, stableID: storeKey)
          }
          self.clearTLSFailure()
          completionHandler(.useCredential, URLCredential(trust: trust))
          return
        }
      }
    }

    if systemTrustOk || !self.params.required {
      self.clearTLSFailure()
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      self.recordTLSFailure(
        GatewayTLSValidationFailure(
          kind: fingerprint == nil ? .certificateUnavailable : .untrustedCertificate,
          host: host,
          storeKey: self.params.storeKey,
          expectedFingerprint: expected,
          observedFingerprint: fingerprint,
          systemTrustOk: false))
      completionHandler(.cancelAuthenticationChallenge, nil)
    }
  }
}

private func certificateFingerprint(_ trust: SecTrust) -> String? {
  guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
    let cert = chain.first
  else {
    return nil
  }
  return sha256Hex(SecCertificateCopyData(cert) as Data)
}

private func sha256Hex(_ data: Data) -> String {
  let digest = SHA256.hash(data: data)
  return digest.map { String(format: "%02x", $0) }.joined()
}

private func normalizeFingerprint(_ raw: String) -> String {
  let stripped = raw.replacingOccurrences(
    of: #"(?i)^sha-?256\s*:?\s*"#,
    with: "",
    options: .regularExpression)
  return stripped.lowercased().filter(\.isHexDigit)
}
