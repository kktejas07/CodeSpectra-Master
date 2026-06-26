# iOS — CodeSpectra Mobile (SwiftUI)

A minimal SwiftUI scaffold (iOS 16+) that consumes the public CodeSpectra
certification APIs.

## Open in Xcode

1. Create a new Xcode project: **iOS → App**, name `CodeSpectraMobile`,
   interface **SwiftUI**, language **Swift**.
2. Replace the generated `ContentView.swift` / `CodeSpectraMobileApp.swift`
   with the files in this folder.
3. Set `APIClient.API_BASE_URL` to your CodeSpectra deployment.
4. Build & run. The first screen lists `/api/certifications`.

## What it demonstrates

- MVVM with `@MainActor` and async/await `URLSession`.
- Cookie-based session that integrates with Better Auth.
- Decodable models that mirror the chunked `/api/certifications` response.
- NavigationStack-based detail view.

## Next steps (not implemented)

- Sign-in flow via `SFSafariViewController` (point at `/auth/login?from=mobile`).
- AI Inventory listing using `/api/ai-inventory` chunked pagination.
- Certificate QR scanning using `AVCaptureSession` (call `verifyCertificate`).
