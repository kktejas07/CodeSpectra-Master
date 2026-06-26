// CertificationsScreen.kt
//
// MVVM (ViewModel + Compose). The screen displays the public certification
// catalog returned by `/api/certifications`. Tapping a row opens a detail
// dialog with the source curriculum and license attribution.
package dev.codespectra.mobile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CertUiState(
  val items: List<CertCatalog> = emptyList(),
  val loading: Boolean = false,
  val error: String? = null,
)

class CertificationsViewModel : ViewModel() {
  private val _state = MutableStateFlow(CertUiState())
  val state: StateFlow<CertUiState> = _state.asStateFlow()

  init { load() }

  fun load() {
    viewModelScope.launch {
      _state.value = _state.value.copy(loading = true, error = null)
      try {
        val res = ApiClient.fetchCertifications()
        _state.value = CertUiState(items = res.items, loading = false)
      } catch (e: Throwable) {
        _state.value = _state.value.copy(loading = false, error = e.message ?: "unknown")
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CertificationsScreen(vm: CertificationsViewModel = viewModel()) {
  val state by vm.state.collectAsState()
  var selected by remember { mutableStateOf<CertCatalog?>(null) }

  Scaffold(topBar = { TopAppBar(title = { Text("CodeSpectra Certifications") }) }) { padding ->
    Box(modifier = Modifier.fillMaxSize().padding(padding)) {
      when {
        state.loading && state.items.isEmpty() -> {
          CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }
        state.error != null && state.items.isEmpty() -> {
          Column(modifier = Modifier.align(Alignment.Center).padding(24.dp)) {
            Text("Failed to load", style = MaterialTheme.typography.titleMedium)
            Text(state.error ?: "", style = MaterialTheme.typography.bodySmall)
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = { vm.load() }) { Text("Retry") }
          }
        }
        else -> {
          LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.items, key = { it.id }) { cert ->
              CertRow(cert) { selected = cert }
              Divider()
            }
          }
        }
      }
    }
  }

  selected?.let { cert ->
    AlertDialog(
      onDismissRequest = { selected = null },
      title = { Text(cert.title) },
      text = {
        Column {
          Text(cert.description)
          Spacer(modifier = Modifier.height(12.dp))
          Text("Level: ${cert.level}", style = MaterialTheme.typography.bodySmall)
          Text("Duration: ${cert.duration} min", style = MaterialTheme.typography.bodySmall)
          Text("Questions: ${cert.questionCount}", style = MaterialTheme.typography.bodySmall)
          Text("Passing score: ${cert.passingScore}%", style = MaterialTheme.typography.bodySmall)
          Text(
            "Source: ${cert.source} (${cert.license})",
            style = MaterialTheme.typography.bodySmall,
          )
        }
      },
      confirmButton = { TextButton(onClick = { selected = null }) { Text("Close") } },
    )
  }
}

@Composable
private fun CertRow(cert: CertCatalog, onClick: () -> Unit) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Surface(
      shape = MaterialTheme.shapes.small,
      color = MaterialTheme.colorScheme.primaryContainer,
      modifier = Modifier.size(40.dp),
    ) {
      Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
        Text(cert.icon, fontWeight = FontWeight.Bold)
      }
    }
    Spacer(modifier = Modifier.width(12.dp))
    Column(modifier = Modifier.weight(1f)) {
      Text(cert.title, style = MaterialTheme.typography.titleMedium)
      Text(
        cert.description,
        style = MaterialTheme.typography.bodySmall,
        maxLines = 2,
      )
      Text(
        "${cert.level} · ${cert.duration}m · ${cert.source}",
        style = MaterialTheme.typography.labelSmall,
      )
    }
  }
}
