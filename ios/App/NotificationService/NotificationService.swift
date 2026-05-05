import UserNotifications
import Intents

/// Notification Service Extension — runs in a separate process whenever an APNs
/// payload includes `mutable-content: 1`. Two responsibilities:
///
///   1. Rich notifications (Feature 9) — download the optional `image_url` from
///      the payload and attach it as a UNNotificationAttachment so the user sees
///      a thumbnail (PR chart, video preview, streak flame) instead of plain text.
///
///   2. Communication Notifications — for the whitelisted "message" types we
///      upgrade the content via INSendMessageIntent so iOS grants the same
///      screen-wake + sound treatment WhatsApp enjoys (sender_id / conversation_id
///      stable across pushes signal a real recurring conversation).
///
/// Both run in sequence: image is downloaded first (with a hard timeout so we
/// never burn the ~30 s NSE budget), then the Communication upgrade is applied.
class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?
    var pendingDownload: URLSessionDownloadTask?

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

        // ── 1. Rich notification — try to attach an image (Feature 9) ─────────
        // The image URL flows in via APNs userInfo. Backend writes it as either
        // `image_url` (preferred) or `attachment_url` (legacy). HTTPS only — iOS
        // refuses cleartext attachments by default and we don't want to relax ATS.
        let rawImageUrl = (mutableContent.userInfo["image_url"] as? String)
            ?? (mutableContent.userInfo["attachment_url"] as? String)
            ?? ""

        if !rawImageUrl.isEmpty,
           let imageUrl = URL(string: rawImageUrl),
           imageUrl.scheme == "https" {
            downloadAndAttach(url: imageUrl, into: mutableContent) { [weak self] in
                self?.applyCommunicationUpgrade(on: mutableContent)
            }
        } else {
            applyCommunicationUpgrade(on: mutableContent)
        }
    }

    /// Downloads the image to the temporary directory, moves it to a unique path
    /// (the temp file is auto-deleted after `completion`), and attaches it.
    /// Hard timeout of 6 s leaves headroom for the Communication upgrade step.
    private func downloadAndAttach(
        url: URL,
        into content: UNMutableNotificationContent,
        completion: @escaping () -> Void
    ) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 6
        config.timeoutIntervalForResource = 8
        let session = URLSession(configuration: config)
        pendingDownload = session.downloadTask(with: url) { tempURL, _, error in
            defer { completion() }
            guard let tempURL = tempURL, error == nil else { return }
            // Move to a unique cache path — UNNotificationAttachment refuses files
            // from the system's auto-deleted temp location.
            let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let dest = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("irontracks-notif-\(UUID().uuidString).\(ext)")
            do {
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tempURL, to: dest)
                let attachment = try UNNotificationAttachment(
                    identifier: "image",
                    url: dest,
                    options: nil
                )
                content.attachments = [attachment]
            } catch {
                // Silent fail — better to deliver the notification without image
                // than to drop it entirely.
            }
        }
        pendingDownload?.resume()
    }

    /// Whitelist of types that get upgraded to Communication Notification.
    /// KEEP IN SYNC with WAKE_SCREEN_TYPES in src/lib/push/apns.ts.
    private static let wakeScreenTypes: Set<String> = [
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

    /// Applies the Communication Notification upgrade if the type is whitelisted,
    /// otherwise delivers the (possibly image-attached) content as-is.
    private func applyCommunicationUpgrade(on mutableContent: UNMutableNotificationContent) {
        let type = mutableContent.userInfo["type"] as? String ?? ""

        guard NotificationService.wakeScreenTypes.contains(type) else {
            contentHandler?(mutableContent)
            return
        }

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
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)

        do {
            let updatedContent = try mutableContent.updating(from: intent)
            contentHandler?(updatedContent)
        } catch {
            contentHandler?(mutableContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // Called just before the extension is terminated by iOS — cancel the
        // image download and deliver whatever we have. Better a plain notif than
        // a dropped one.
        pendingDownload?.cancel()
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }
}
