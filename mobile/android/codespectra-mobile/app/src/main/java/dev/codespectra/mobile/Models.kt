// Models.kt
//
// Kotlinx-serializable mirrors of `/api/certifications`. Keep in sync with
// `/app/frontend/lib/db/certifications.ts` (publicCertView).
package dev.codespectra.mobile

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CertCatalog(
  val id: String,
  val slug: String,
  val title: String,
  val level: String,
  val category: String,
  val description: String,
  val icon: String,
  val duration: Int,
  @SerialName("passing_score") val passingScore: Int,
  val source: String,
  @SerialName("source_url") val sourceUrl: String? = null,
  val license: String,
  @SerialName("question_count") val questionCount: Int,
  @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class CertCatalogResponse(
  val items: List<CertCatalog>,
  @SerialName("next_cursor") val nextCursor: String? = null,
  @SerialName("has_more") val hasMore: Boolean,
  val total: Int,
)

@Serializable
data class CertVerifySnapshot(
  val title: String,
  val level: String,
  val source: String,
)

@Serializable
data class CertCandidate(val name: String)

@Serializable
data class CertVerifyResponse(
  val valid: Boolean,
  val reason: String? = null,
  val candidate: CertCandidate? = null,
  val certification: CertVerifySnapshot? = null,
  val score: Int? = null,
  @SerialName("issued_at") val issuedAt: String? = null,
)
