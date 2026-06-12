import Foundation
import Security
import Capacitor

/// On-device credential storage in the iOS Keychain.
///
/// Phase B foundation: the encrypted credential bundle (password, totpSecret,
/// portal credentials, matrix) lives only on this device. The server is no
/// longer the source of truth once migration completes. See
/// docs/ios-native/DEVICE_LINK.md for the bundle shape and the SecureCreds
/// contract.
///
/// Stored as a single JSON string under one generic-password item. Accessible
/// only after first unlock and never synced to iCloud / migrated to a new
/// device (that's what the DeviceLink plugin is for).
@objc(SecureCredsPlugin)
public class SecureCredsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureCredsPlugin"
    public let jsName = "SecureCreds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private static let service = "ac.isct.campus.creds"
    private static let account = "bundle"

    @objc func save(_ call: CAPPluginCall) {
        guard let bundle = call.getString("bundle"),
              let data = bundle.data(using: .utf8) else {
            call.reject("Missing or invalid bundle")
            return
        }

        // Delete any existing item, then add fresh (avoids SecItemUpdate edge cases).
        SecItemDelete(baseQuery() as CFDictionary)

        var attrs = baseQuery()
        attrs[kSecValueData as String] = data
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attrs as CFDictionary, nil)
        if status == errSecSuccess {
            NSLog("SecureCreds: saved bundle to Keychain (%d bytes)", data.count)
            call.resolve(["ok": true])
        } else {
            call.reject("Keychain save failed (\(status))")
        }
    }

    @objc func load(_ call: CAPPluginCall) {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound {
            NSLog("SecureCreds: load — no bundle in Keychain")
            call.resolve(["bundle": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else {
            call.reject("Keychain load failed (\(status))")
            return
        }
        NSLog("SecureCreds: loaded bundle from Keychain (%d bytes)", data.count)
        call.resolve(["bundle": str])
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve(["ok": true])
        } else {
            call.reject("Keychain clear failed (\(status))")
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: SecureCredsPlugin.service,
            kSecAttrAccount as String: SecureCredsPlugin.account,
        ]
    }
}
