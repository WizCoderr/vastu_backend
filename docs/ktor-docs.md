# Ktor Documentation & Cheat Sheet

Ktor is an asynchronous framework for creating microservices, web applications, and more. It is built from the ground up using Kotlin and Coroutines.

## 1. Core Concepts
- **Asynchronous**: Built on Kotlin Coroutines for high scalability.
- **Unopinionated**: Flexible structure, you choose the libraries (DI, DB, Logging).
- **Plugins**: Functionality is added via plugins (formerly "features").
- **Multiplatform**: Can run on JVM, Android, iOS, JS, and Native (Client).

## 2. Project Setup

### Gradle (Kotlin DSL)
```kotlin
plugins {
    kotlin("jvm") version "1.9.0"
    id("io.ktor.plugin") version "2.3.0"
}

dependencies {
    implementation("io.ktor:ktor-server-core-jvm:2.3.0")
    implementation("io.ktor:ktor-server-netty-jvm:2.3.0") // Engine
    implementation("ch.qos.logback:logback-classic:1.4.7")
}
```

## 3. Server Configuration

Ktor supported engines: Netty, CIO, Jetty, Tomcat.

### Embedded Server (Simple)
```kotlin
fun main() {
    embeddedServer(Netty, port = 8080) {
        routing {
            get("/") {
                call.respondText("Hello, Ktor!")
            }
        }
    }.start(wait = true)
}
```

### Application.conf (HOCON)
Define configuration in `src/main/resources/application.conf`:
```hocon
ktor {
    deployment {
        port = 8080
    }
    application {
        modules = [ com.example.ApplicationKt.module ]
    }
}
```

## 4. Routing
Routing is the core of Ktor, handling incoming requests.

```kotlin
routing {
    // Basic GET
    get("/") {
        call.respondText("Root")
    }

    // Path Parameters
    get("/users/{id}") {
        val id = call.parameters["id"]
        call.respondText("User ID: $id")
    }

    // Query Parameters
    get("/search") {
        val query = call.request.queryParameters["q"]
        call.respondText("Searching for: $query")
    }

    // Grouping routes
    route("/api") {
        get("/v1") { ... }
        post("/v1") { ... }
    }
}
```

## 5. Plugins (Features)
Functionality like Serialization, CORS, Auth are added via Plugins.

### Content Negotiation (JSON)
```kotlin
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.plugins.contentnegotiation.*

install(ContentNegotiation) {
    json()
}
```

### CORS
```kotlin
import io.ktor.server.plugins.cors.routing.*

install(CORS) {
    allowMethod(HttpMethod.Options)
    allowMethod(HttpMethod.Put)
    allowMethod(HttpMethod.Delete)
    allowHeader(HttpHeaders.Authorization)
    anyHost() // Use specific hosts in production
}
```

### Call Logging
```kotlin
import io.ktor.server.plugins.callloging.*

install(CallLogging) {
    level = Level.INFO
}
```

## 6. Request & Response

### Request
```kotlin
val uri = call.request.uri
val headers = call.request.headers
val body = call.receive<MyDataClass>() // Requires ContentNegotiation
```

### Response
```kotlin
call.respondText("Hello")
call.respond(HttpStatusCode.Created, myObject) // JSON response
call.respondRedirect("/login")
```

## 7. Authentication
Ktor supports various auth mechanisms (Basic, Digest, JWT, OAuth, etc.).

### JWT Example
```kotlin
install(Authentication) {
    jwt("auth-jwt") {
        realm = "myRealm"
        verifier(JwkProviderBuilder("...").build(), "issuer") {
            acceptLeeway(3)
        }
        validate { credential ->
            if (credential.payload.getClaim("username").asString() != "") {
                JWTPrincipal(credential.payload)
            } else {
                null
            }
        }
    }
}

routing {
    authenticate("auth-jwt") {
        get("/protected") {
             val principal = call.principal<JWTPrincipal>()
             // ...
        }
    }
}
```

## 8. Ktor Client
Ktor also has a powerful asynchronous HTTP client.

```kotlin
val client = HttpClient(CIO) {
    install(ContentNegotiation) {
        json()
    }
}

val response: HttpResponse = client.get("https://api.example.com/data")
val data: MyData = client.get("https://api.example.com/data").body()
```

## 9. WebSockets
```kotlin
install(WebSockets) {
    pingPeriod = Duration.ofSeconds(15)
}

routing {
    webSocket("/chat") {
        for (frame in incoming) {
            if (frame is Frame.Text) {
                val text = frame.readText()
                outgoing.send(Frame.Text("You said: $text"))
            }
        }
    }
}
```

## 10. Status Pages (Error Handling)
Handle exceptions globally.

```kotlin
install(StatusPages) {
    exception<Throwable> { call, cause ->
        call.respondText(text = "500: $cause" , status = HttpStatusCode.InternalServerError)
    }
    status(HttpStatusCode.NotFound) { call, status ->
        call.respondText(text = "404: Page Not Found", status = status)
    }
}
```

## 11. Testing
Use `ktor-server-test-host` for integration testing.

```kotlin
@Test
fun testRoot() = testApplication {
    application {
        module()
    }
    client.get("/").apply {
        assertEquals(HttpStatusCode.OK, status)
        assertEquals("Hello, Ktor!", bodyAsText())
    }
}
```
