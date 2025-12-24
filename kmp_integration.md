# Ktor & Koin KMP Integration Guide

This guide details how to integrate Ktor and Koin in your Kotlin Multiplatform (KMP) project to interact with the Vastu Backend.

## 1. Backend Verification
We have verified the backend (Vastu Backend) to ensure:
- **Content-Type**: All API endpoints support `application/json`.
- **Error Handling**: A global error handler has been added to ensure 500 errors return JSON, not HTML (which causes Ktor defaults to crash).
- **Response Format**: Uses a standard `{ success: Boolean, data: T?, error: String? }` envelope.

## 2. Dependencies (`build.gradle.kts`)
Add the following to your `commonMain` dependencies:

```kotlin
val ktorVersion = "3.0.0" // Check for latest
val koinVersion = "4.0.0"

implementation("io.ktor:ktor-client-core:$ktorVersion")
implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
implementation("io.ktor:ktor-client-logging:$ktorVersion")
implementation("io.insert-koin:koin-core:$koinVersion")
```

## 3. Data Models
Create a generic wrapper to match the backend's `Result` type.

```kotlin
@Serializable
data class ApiResult<T>(
    val success: Boolean,
    val data: T? = null,
    val error: String? = null
)
```

## 4. Koin Module & HttpClient Setup
Define your Koin module in `commonMain`.

```kotlin
val appModule = module {
    single {
        HttpClient {
            install(ContentNegotiation) {
                json(Json {
                    prettyPrint = true
                    isLenient = true
                    ignoreUnknownKeys = true
                })
            }
            install(Logging) {
                level = LogLevel.ALL
            }
            defaultRequest {
                // Use 10.0.2.2 for Android Emulator, localhost for iOS Sim
                url("http://10.0.2.2:3000/") 
                header(HttpHeaders.ContentType, ContentType.Application.Json)
            }
        }
    }
    
    single { AuthRepository(get()) }
}
```

## 5. Repository Implementation
Example of how to consume the API.

```kotlin
class AuthRepository(private val client: HttpClient) {
    
    suspend fun login(loginRequest: LoginRequest): ApiResult<AuthResponse> {
        return try {
            val response: HttpResponse = client.post("/auth/login") {
                setBody(loginRequest)
            }
            
            // Ktor does not throw on 4xx/5xx by default if expectSuccess = false (default)
            // But we can check status manualy or let the backend's JSON response handle it.
            if (response.status.value in 200..299) {
                response.body()
            } else {
                // If backend returns JSON error on 400
                response.body() 
            }
        } catch (e: Exception) {
            ApiResult(success = false, error = e.message)
        }
    }
}
```

## 6. Common Pitfalls
- **Localhost**: On Android emulator, `localhost` is the emulator itself, not your PC. Use `10.0.2.2`.
- **Cleartext Traffic**: Ensure `android:usesCleartextTraffic="true"` is in your `AndroidManifest.xml` if using http.
- **Serialization**: Ensure all DTOs are annotated with `@Serializable`.
