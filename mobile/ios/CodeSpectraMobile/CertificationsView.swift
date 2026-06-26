// CertificationsView.swift
//
// MVVM list + detail. ViewModel owns @Published state; the View observes
// it and renders rows. Tapping a row navigates to a detail page that
// shows the source curriculum and a button that demos the verify flow
// using a placeholder token.

import SwiftUI

@MainActor
final class CertificationsViewModel: ObservableObject {
  @Published var items: [CertCatalog] = []
  @Published var isLoading: Bool = false
  @Published var error: String?

  func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
      let res = try await APIClient.shared.fetchCertifications()
      self.items = res.items
      self.error = nil
    } catch {
      self.error = "\(error)"
    }
  }
}

struct CertificationsView: View {
  @StateObject private var vm = CertificationsViewModel()

  var body: some View {
    Group {
      if vm.isLoading && vm.items.isEmpty {
        ProgressView("Loading…")
      } else if let err = vm.error {
        VStack(spacing: 12) {
          Text("Failed to load").font(.headline)
          Text(err).font(.caption).foregroundColor(.secondary)
          Button("Retry") { Task { await vm.load() } }
        }
        .padding()
      } else {
        List(vm.items) { cert in
          NavigationLink(value: cert) {
            CertRow(cert: cert)
          }
        }
        .navigationDestination(for: CertCatalog.self) { cert in
          CertDetailView(cert: cert)
        }
        .refreshable { await vm.load() }
      }
    }
    .task { await vm.load() }
  }
}

struct CertRow: View {
  let cert: CertCatalog
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Text(cert.icon)
        .font(.title2.bold())
        .frame(width: 40, height: 40)
        .background(Color.accentColor.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 8))
      VStack(alignment: .leading, spacing: 4) {
        Text(cert.title).font(.headline)
        Text(cert.description).font(.caption).foregroundColor(.secondary).lineLimit(2)
        HStack(spacing: 8) {
          Label(cert.level, systemImage: "graduationcap")
          Label("\(cert.duration)m", systemImage: "clock")
        }
        .font(.caption2).foregroundColor(.secondary)
      }
    }
    .padding(.vertical, 4)
  }
}

struct CertDetailView: View {
  let cert: CertCatalog
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text(cert.title).font(.largeTitle.bold())
        Text(cert.description).foregroundColor(.secondary)
        Divider()
        Group {
          row("Level", cert.level)
          row("Category", cert.category.capitalized)
          row("Duration", "\(cert.duration) minutes")
          row("Questions", String(cert.question_count))
          row("Passing score", "\(cert.passing_score)%")
          row("Source", "\(cert.source) (\(cert.license))")
        }
        if let url = cert.source_url, let link = URL(string: url) {
          Link("Open source material", destination: link)
        }
        Spacer()
      }
      .padding()
    }
    .navigationTitle(cert.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func row(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label).foregroundColor(.secondary)
      Spacer()
      Text(value).fontWeight(.medium)
    }
  }
}
