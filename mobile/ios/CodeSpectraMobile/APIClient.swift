// APIClient.swift
//
// Thin URLSession wrapper around the CodeSpectra public API. The client
// is intentionally minimal — no third-party dependencies — so it drops
// straight into a new Xcode project. Cookies persist via the default
// shared HTTPCookieStorage.

import Foundation

enum APIError: Error {
  case http(Int)
  case decode(String)
  case transport(String)
}

final class APIClient {
  /// Point this at your CodeSpectra deployment.
  static let API_BASE_URL: String = "https://codespectra-master.preview.emergentagent.com"

  static let shared = APIClient()

  private let session: URLSession

  private init() {
    let config = URLSessionConfiguration.default
    config.httpCookieStorage = HTTPCookieStorage.shared
    config.httpShouldSetCookies = true
    config.httpCookieAcceptPolicy = .always
    self.session = URLSession(configuration: config)
  }

  /// Fetch the certification catalog. Public endpoint, no auth required.
  func fetchCertifications(category: String? = nil, limit: Int = 50) async throws -> CertCatalogResponse {
    var components = URLComponents(string: "\(Self.API_BASE_URL)/api/certifications")!
    var items: [URLQueryItem] = [URLQueryItem(name: "limit", value: String(limit))]
    if let category { items.append(URLQueryItem(name: "category", value: category)) }
    components.queryItems = items

    let (data, response) = try await session.data(from: components.url!)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw APIError.http((response as? HTTPURLResponse)?.statusCode ?? -1)
    }
    do {
      return try JSONDecoder().decode(CertCatalogResponse.self, from: data)
    } catch {
      throw APIError.decode(error.localizedDescription)
    }
  }

  /// Verify a certificate by token. Public endpoint.
  func verifyCertificate(token: String) async throws -> CertVerifyResponse {
    let url = URL(string: "\(Self.API_BASE_URL)/api/certifications/verify/\(token)")!
    let (data, response) = try await session.data(from: url)
    guard let http = response as? HTTPURLResponse, (200..<500).contains(http.statusCode) else {
      throw APIError.http((response as? HTTPURLResponse)?.statusCode ?? -1)
    }
    do {
      return try JSONDecoder().decode(CertVerifyResponse.self, from: data)
    } catch {
      throw APIError.decode(error.localizedDescription)
    }
  }

  /// Example bearer-token attachment. Uncomment + set BETTER_AUTH_BEARER_TOKEN
  /// in your build config to enable header-based auth on protected endpoints.
  // private func authed(_ url: URL) -> URLRequest {
  //   var req = URLRequest(url: url)
  //   if let token = ProcessInfo.processInfo.environment["BETTER_AUTH_BEARER_TOKEN"] {
  //     req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
  //   }
  //   return req
  // }
}
