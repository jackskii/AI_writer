import time
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings


class SecurityHeadersMiddleware(MiddlewareMixin):
    """
    Security headers middleware for production
    """
    
    def process_response(self, request, response):
        # Content Security Policy
        if not settings.DEBUG:
            response['Content-Security-Policy'] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self' https:; "
                "font-src 'self' https:; "
                "frame-ancestors 'none'; "
                "base-uri 'self';"
            )
        
        # Additional security headers
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = settings.X_FRAME_OPTIONS
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        # Remove server information
        if 'Server' in response:
            del response['Server']
        
        return response


class RateLimitMiddleware(MiddlewareMixin):
    """
    Simple rate limiting middleware
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.request_counts = {}
        super().__init__(get_response)
    
    def process_request(self, request):
        if not getattr(settings, 'RATE_LIMIT_ENABLED', True):
            return None
            
        # Simple IP-based rate limiting for streaming endpoints
        if '/ai/' in request.path and 'stream' in request.path:
            ip = self.get_client_ip(request)
            current_time = int(time.time())
            
            # Clean old entries
            self.request_counts = {
                k: v for k, v in self.request_counts.items()
                if current_time - v['timestamp'] < 60  # 1 minute window
            }
            
            # Check rate limit (max 10 requests per minute per IP)
            if ip in self.request_counts:
                if self.request_counts[ip]['count'] >= 10:
                    from django.http import HttpResponse
                    return HttpResponse(
                        'data: {"type": "error", "message": "Rate limit exceeded"}\n\n',
                        content_type='text/event-stream',
                        status=429
                    )
                self.request_counts[ip]['count'] += 1
            else:
                self.request_counts[ip] = {'count': 1, 'timestamp': current_time}
        
        return None
    
    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip