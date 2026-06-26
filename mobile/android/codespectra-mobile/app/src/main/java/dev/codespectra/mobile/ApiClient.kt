// ApiClient.kt
//
// OkHttp + kotlinx-serialization client. Uses an in-memory CookieJar so
// Better Auth's session cookie persists across requests in the app
// session (swap for `PersistentCookieJar` if you want it to survive
// restarts).
package dev.codespectra.mobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

object ApiClient {
  const val API_BASE_URL: String = "https://codespectra-master.preview.emergentagent.com"

  private val cookieJar = object : CookieJar {
    private val store = mutableMapOf<String, MutableList<Cookie>>()
    override fun loadForRequest(url: HttpUrl): List<Cookie> = store[url.host] ?: emptyList()
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
      store.getOrPut(url.host) { mutableListOf() }.apply {
        clear()
        addAll(cookies)
      }
    }
  }

  private val client: OkHttpClient = OkHttpClient.Builder()
    .cookieJar(cookieJar)
    .build()

  private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
  }

  suspend fun fetchCertifications(category: String? = null, limit: Int = 50): CertCatalogResponse =
    withContext(Dispatchers.IO) {
      val url = ("$API_BASE_URL/api/certifications").toHttpUrl().newBuilder().apply {
        addQueryParameter("limit", limit.toString())
        category?.let { addQueryParameter("category", it) }
      }.build()
      val req = Request.Builder().url(url).get().build()
      client.newCall(req).execute().use { resp ->
        if (!resp.isSuccessful) error("HTTP ${resp.code}")
        json.decodeFromString(CertCatalogResponse.serializer(), resp.body!!.string())
      }
    }

  suspend fun verifyCertificate(token: String): CertVerifyResponse =
    withContext(Dispatchers.IO) {
      val req = Request.Builder().url("$API_BASE_URL/api/certifications/verify/$token").get().build()
      client.newCall(req).execute().use { resp ->
        json.decodeFromString(CertVerifyResponse.serializer(), resp.body!!.string())
      }
    }
}
