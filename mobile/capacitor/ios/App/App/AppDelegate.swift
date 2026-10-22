import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

/// Push: the server sends through FCM (frontend/lib/push-notifications.ts),
/// the same channel as Android. Firebase turns the APNs device token into an
/// FCM registration token, which @capacitor/push-notifications hands to the
/// web app ("registration" event) → POST /api/notifications/push-token
/// {platform:'ios'}. Needs GoogleService-Info.plist (CI writes it from the
/// IOS_GOOGLE_SERVICE_INFO_PLIST_B64 secret) and the APNs key in Firebase.
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var firebaseReady = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Without the plist (local builds) Firebase would crash on configure(); push just stays off.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            firebaseReady = true
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard firebaseReady else {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: NSError(domain: "CodeSpectra", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase not configured"]))
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let token = token, error == nil {
                // A String (not Data): the push plugin passes it to the web app as-is.
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            } else {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
