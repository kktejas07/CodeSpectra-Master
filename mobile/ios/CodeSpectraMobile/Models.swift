// Models.swift
//
// Decodable models matching `/api/certifications` and
// `/api/certifications/verify/{token}` JSON shape exactly. Keep these in
// sync with `/app/frontend/lib/db/certifications.ts` (publicCertView).

import Foundation

struct CertCatalog: Codable, Identifiable, Hashable {
  let id: String
  let slug: String
  let title: String
  let level: String
  let category: String
  let description: String
  let icon: String
  let duration: Int
  let passing_score: Int
  let source: String
  let source_url: String?
  let license: String
  let question_count: Int
  let is_active: Bool
}

struct CertCatalogResponse: Codable {
  let items: [CertCatalog]
  let next_cursor: String?
  let has_more: Bool
  let total: Int
}

struct CertVerifySnapshot: Codable {
  let title: String
  let level: String
  let source: String
}

struct CertCandidate: Codable {
  let name: String
}

struct CertVerifyResponse: Codable {
  let valid: Bool
  let reason: String?
  let candidate: CertCandidate?
  let certification: CertVerifySnapshot?
  let score: Int?
  let issued_at: String?
}
