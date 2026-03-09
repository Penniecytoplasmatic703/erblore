package org.booklore.config.security.filter;

import org.booklore.config.security.JwtUtils;
import org.booklore.mapper.custom.BookLoreUserTransformer;
import org.booklore.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class CustomFontJwtFilter extends AbstractQueryParameterJwtFilter {

    public CustomFontJwtFilter(
            JwtUtils jwtUtils,
            UserRepository userRepository,
            BookLoreUserTransformer bookLoreUserTransformer) {
        super(jwtUtils, userRepository, bookLoreUserTransformer);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
//        String path = request.getRequestURI();
        // Only filter requests to custom font file endpoints (e.g., /api/v1/custom-fonts/123/file)
//        return !(path.startsWith("/api/v1/custom-fonts/") && path.endsWith("/file"));
        return true;
    }
}
