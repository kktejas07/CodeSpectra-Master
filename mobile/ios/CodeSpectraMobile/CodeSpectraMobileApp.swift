// CodeSpectraMobileApp.swift
//
// SwiftUI entry point. Sets up a NavigationStack and renders the
// CertificationsView. iOS 16+.

import SwiftUI

@main
struct CodeSpectraMobileApp: App {
  var body: some Scene {
    WindowGroup {
      NavigationStack {
        CertificationsView()
          .navigationTitle("CodeSpectra")
      }
    }
  }
}
