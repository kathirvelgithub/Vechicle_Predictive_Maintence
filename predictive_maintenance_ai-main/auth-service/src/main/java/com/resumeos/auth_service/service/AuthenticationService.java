package com.resumeos.auth_service.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.resumeos.auth_service.dto.AuthenticationRequest;
import com.resumeos.auth_service.dto.AuthenticationResponse;
import com.resumeos.auth_service.dto.RegisterRequest;
import com.resumeos.auth_service.entity.Role;
import com.resumeos.auth_service.entity.User;
import com.resumeos.auth_service.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value; // <--- Import this!
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthenticationService {

    private final UserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    // --- UPDATED: Inject from application.properties ---
    @Value("${google.client.id}")
    private String googleClientId;

    public AuthenticationResponse register(RegisterRequest request) {
        // 1. Sanitize the role string from React
        String sanitizedRole = request.getRole().replace("-", "_").toUpperCase();

        // 2. Convert to Enum (Default to USER if invalid)
        Role userRole;
        try {
            userRole = Role.valueOf(sanitizedRole);
        } catch (IllegalArgumentException | NullPointerException e) {
            userRole = Role.USER;
        }

        // 3. Create the User entity
        var user = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .location(request.getLocation())
                .plant(request.getPlant())
                .role(userRole)
                .build();

        repository.save(user);

        // 4. Generate Token
        var jwtToken = jwtService.generateToken(user);
        return AuthenticationResponse.builder().token(jwtToken).build();
    }

    public AuthenticationResponse authenticate(AuthenticationRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );
        var user = repository.findByEmail(request.getEmail()).orElseThrow();
        var jwtToken = jwtService.generateToken(user);
        return AuthenticationResponse.builder().token(jwtToken).build();
    }

    public AuthenticationResponse loginWithGoogle(String googleToken) {
        try {
            // --- UPDATED: Use the injected 'googleClientId' variable ---
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId)) // <--- Usage here
                    .build();

            GoogleIdToken idToken = verifier.verify(googleToken);
            if (idToken == null) {
                throw new RuntimeException("Invalid Google Token");
            }

            // 2. Extract User Info from Google Token
            GoogleIdToken.Payload payload = idToken.getPayload();
            String email = payload.getEmail();
            String name = (String) payload.get("name");

            // 3. Check if User Exists in DB (Create if not)
            User user = repository.findByEmail(email).orElseGet(() -> {
                // Auto-Register new user from Google
                var newUser = User.builder()
                        .fullName(name)
                        .email(email)
                        // Generate random secure password since they use Google to login
                        .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                        .role(Role.USER)      // Default role
                        .location("Remote")   // Default location
                        .plant("Global")      // Default plant
                        .build();
                return repository.save(newUser);
            });

            // 4. Generate JWT for our app
            var jwtToken = jwtService.generateToken(user);
            return AuthenticationResponse.builder()
                    .token(jwtToken)
                    .build();

        } catch (Exception e) {
            throw new RuntimeException("Google Login Failed: " + e.getMessage());
        }
    }
}