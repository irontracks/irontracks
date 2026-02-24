import Foundation
import Capacitor
import AuthenticationServices
import UIKit

@objc(SignInWithApple)
public class SignInWithApple: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "SignInWithApple" 
    public let jsName = "SignInWithApple" 
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ] 

    @objc func authorize(_ call: CAPPluginCall) {
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = getRequestedScopes(from: call)
        request.state = call.getString("state")
        request.nonce = call.getString("nonce")

        let defaults = UserDefaults()
        defaults.setValue(call.callbackId, forKey: "callbackId")

        self.bridge?.saveCall(call)

        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = self
        authorizationController.presentationContextProvider = self
        authorizationController.performRequests()
    }

    func getRequestedScopes(from call: CAPPluginCall) -> [ASAuthorization.Scope]? {
        var requestedScopes: [ASAuthorization.Scope] = []

        if let scopesStr = call.getString("scopes") {
            if scopesStr.contains("name") {
                requestedScopes.append(.fullName)
            }

            if scopesStr.contains("email") {
                requestedScopes.append(.email)
            }
        }

        if requestedScopes.count > 0 {
            return requestedScopes
        }

        return nil
    }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let anchor = self.bridge?.viewController?.view.window {
            return anchor
        }
        if let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
            return window
        }
        return ASPresentationAnchor()
    }
}

extension SignInWithApple: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }

        let defaults = UserDefaults()
        let id = defaults.string(forKey: "callbackId") ?? ""
        guard let call = self.bridge?.savedCall(withID: id) else {
            return
        }

        let identityToken = appleIDCredential.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        let authorizationCode = appleIDCredential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        if identityToken == nil || authorizationCode == nil {
            call.reject("missing_token")
            self.bridge?.releaseCall(call)
            return
        }

        let result = [
            "response": [
                "user": appleIDCredential.user,
                "email": appleIDCredential.email,
                "givenName": appleIDCredential.fullName?.givenName,
                "familyName": appleIDCredential.fullName?.familyName,
                "identityToken": identityToken,
                "authorizationCode": authorizationCode
            ]
        ]

        call.resolve(result)
        self.bridge?.releaseCall(call)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let defaults = UserDefaults()
        let id = defaults.string(forKey: "callbackId") ?? ""
        guard let call = self.bridge?.savedCall(withID: id) else {
            return
        }
        call.reject(error.localizedDescription)
        self.bridge?.releaseCall(call)
    }
}
