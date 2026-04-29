import UserNotifications
import Intents

/// Notification Service Extension — intercepts remote pushes with mutable-content:1
/// and upgrades "message" type notifications to Communication Notifications via
/// INSendMessageIntent. This gives IronTracks the same guaranteed screen-wake + sound
/// on locked devices that WhatsApp enjoys.
class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler

        guard let mutableContent = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttemptContent = mutableContent

        // Whitelist of types that get upgraded to Communication Notification.
        // KEEP IN SYNC with WAKE_SCREEN_TYPES in src/lib/push/apns.ts.
        let wakeScreenTypes: Set<String> = [
            "access_request", "admin_new_signup",
            "billing_issue",
            "direct_message", "message",
            "follow_request",
            "friend_comeback", "friend_online", "friends_trained_today",
            "inactivity",
            "meal_reminder", "missed_meal",
            "mentioned_in_chat", "mentioned_in_comment",
            "morning_briefing",
            "story_comment", "story_like", "story_posted",
            "team_chat", "team_invite",
            "trial_ending", "vip_welcome",
            "water_reminder",
            "workout_finish", "workout_start",
        ]

        let type = mutableContent.userInfo["type"] as? String ?? ""

        guard wakeScreenTypes.contains(type) else {
            // Not in whitelist — deliver as-is (still benefits from mutable-content if needed later)
            contentHandler(mutableContent)
            return
        }

        // ── Build INSendMessageIntent ─────────────────────────────────────────
        let senderName = (mutableContent.userInfo["sender_name"] as? String)
            ?? mutableContent.title
        let senderId   = (mutableContent.userInfo["sender_id"] as? String) ?? senderName
        let conversationId = (mutableContent.userInfo["conversation_id"] as? String)
            ?? "irontracks-dm-\(senderId)"

        var nameComponents = PersonNameComponents()
        let parts = senderName.split(separator: " ", maxSplits: 1)
        nameComponents.givenName  = parts.first.map(String.init) ?? senderName
        nameComponents.familyName = parts.count > 1 ? String(parts[1]) : nil

        let personHandle = INPersonHandle(value: senderId, type: .unknown)
        let sender = INPerson(
            personHandle: personHandle,
            nameComponents: nameComponents,
            displayName: senderName,
            image: nil,
            contactIdentifier: nil,
            customIdentifier: senderId
        )

        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: mutableContent.body,
            speakableGroupName: nil,
            conversationIdentifier: conversationId,
            serviceName: "IronTracks",
            sender: sender,
            attachments: nil
        )

        // Donate the interaction so Siri learns about the sender
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)

        // Upgrade the notification content — this is what grants Communication priority
        do {
            let updatedContent = try mutableContent.updating(from: intent)
            contentHandler(updatedContent)
        } catch {
            // Fall back to the original mutable content if the upgrade fails
            contentHandler(mutableContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // Called just before the extension is terminated by iOS.
        // Deliver whatever we have — better than nothing.
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }
}
