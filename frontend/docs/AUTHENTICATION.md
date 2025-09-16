# Authentication System Documentation

Token-based authentication with automatic interceptors, logout handling, and special streaming endpoint support.

## Overview

The authentication system uses Django REST Framework Token authentication with automatic token management, request interceptors, and special handling for streaming endpoints that can't send custom headers.

## Architecture

### Authentication Flow
1. **Login**: User credentials → Django Token → Store in Zustand + localStorage
2. **API Requests**: Automatic token injection via axios interceptors
3. **Streaming Requests**: Token passed via query parameters (EventSource limitation)
4. **Token Expiry**: Automatic logout and redirect to login page

## Token Management

### Storage Strategy
**File**: `frontend/src/stores/useAuthStore.ts`

```typescript
interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (credentials) => {
        const response = await authApi.login(credentials);
        set({
          token: response.data.token,
          user: response.data.user,
          isAuthenticated: true
        });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false
        });
        // Redirect handled by axios interceptor
      }
    }),
    {
      name: 'auth-storage',  // localStorage key
      storage: createJSONStorage(() => localStorage)
    }
  )
);
```

### Persistent Storage
- **Storage**: localStorage with Zustand persist middleware
- **Key**: `auth-storage`
- **Format**: JSON object containing token, user, and isAuthenticated state
- **Automatic**: State automatically restored on page reload

## API Request Authentication

### Axios Interceptors
**File**: `frontend/src/services/api.ts`

```javascript
import axios from 'axios';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - Add auth token to all requests
api.interceptors.request.use(
  (config) => {
    // Get token from Zustand persist storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsedStorage = JSON.parse(authStorage);
        const token = parsedStorage?.state?.token;
        if (token) {
          config.headers.Authorization = `Token ${token}`;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

### Response Interceptor - Auto Logout
```javascript
// Response interceptor - Handle 401 errors with automatic logout
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state and redirect to login
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const parsedStorage = JSON.parse(authStorage);
          const logout = parsedStorage?.state?.logout;
          if (logout) {
            // Clear auth state
            localStorage.removeItem('auth-storage');
            // Redirect to login page
            window.location.href = '/auth';
          }
        } catch (e) {
          console.error('Failed to handle auth error:', e);
          // Fallback: clear storage and redirect
          localStorage.removeItem('auth-storage');
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

## Streaming Authentication

### The EventSource Problem
EventSource (used for Server-Sent Events) cannot send custom headers:

```javascript
// This doesn't work:
const eventSource = new EventSource(url, {
  headers: {
    'Authorization': `Token ${token}`  // ❌ Not supported by EventSource API
  }
});
```

### Solution: Query Parameter Authentication
**File**: `frontend/src/services/api.ts`

```javascript
// Example: Chat streaming with token authentication
chatStream: (workId, chapterId, message, onChunk, onStart, onEnd, onError) => {
  const params = new URLSearchParams({
    work_id: workId.toString(),
    chapter_id: chapterId.toString(),
    message: message,
  });

  // Add token for authentication since EventSource can't send headers
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const parsedStorage = JSON.parse(authStorage);
      const token = parsedStorage?.state?.token;
      if (token) {
        params.append('token', token);  // ✅ Token in query string
      }
    } catch (e) {
      console.error('Failed to parse auth storage:', e);
    }
  }

  const eventSource = new EventSource(
    `${API_BASE_URL}/ai/chat/stream/?${params.toString()}`,
    { withCredentials: true }
  );

  // EventSource will include token in URL
  return eventSource;
}
```

### Backend Token Validation
**File**: `backend/apps/ai_services/views.py`

```python
@csrf_exempt
def ai_chat_stream(request):
    # Check authentication via token query parameter for EventSource compatibility
    user = None
    token = request.GET.get('token')
    if token:
        from rest_framework.authtoken.models import Token
        try:
            token_obj = Token.objects.get(key=token)
            user = token_obj.user
            request.user = user
        except Token.DoesNotExist:
            return HttpResponse(
                'data: {"type": "error", "message": "认证令牌无效"}\n\n',
                content_type='text/event-stream',
                status=401
            )
    elif not request.user.is_authenticated:
        return HttpResponse(
            'data: {"type": "error", "message": "需要认证"}\n\n',
            content_type='text/event-stream',
            status=401
        )
```

## Authentication API

### Login Endpoint
**File**: `frontend/src/services/authApi.ts`

```typescript
interface LoginCredentials {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
  };
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<{ data: AuthResponse }> => {
    const response = await api.post('/auth/login/', credentials);
    return response;
  },

  register: async (userData: RegisterData): Promise<{ data: AuthResponse }> => {
    const response = await api.post('/auth/register/', userData);
    return response;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout/');
  },

  getCurrentUser: async (): Promise<{ data: User }> => {
    const response = await api.get('/auth/user/');
    return response;
  }
};
```

### Usage in Components
```typescript
import { useAuthStore } from '../stores/useAuthStore';

const LoginPage = () => {
  const { login, isAuthenticated } = useAuthStore();

  const handleLogin = async (credentials: LoginCredentials) => {
    try {
      await login(credentials);
      // User is now authenticated, redirect handled by routing
    } catch (error) {
      // Handle login error
      console.error('Login failed:', error);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    // Login form JSX
  );
};
```

## Route Protection

### Protected Route Component
**File**: `frontend/src/components/ProtectedRoute.tsx`

```typescript
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
```

### Route Configuration
```typescript
import { createBrowserRouter } from 'react-router-dom';

export const router = createBrowserRouter([
  {
    path: '/auth',
    element: <AuthPage />
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <HomePage />
      </ProtectedRoute>
    )
  },
  {
    path: '/editor/:workId/:chapterId',
    element: (
      <ProtectedRoute>
        <EditorPage />
      </ProtectedRoute>
    )
  }
]);
```

## Token Security

### Security Considerations

#### 1. Token Storage
**Current**: localStorage (persistent across browser sessions)
**Risk**: XSS attacks can access localStorage
**Mitigation**:
- Sanitize all user inputs
- Use CSP headers
- Consider httpOnly cookies for enhanced security

#### 2. Token in Query Strings
**Risk**: Tokens in URLs are logged in server access logs
**Mitigation**:
- Use HTTPS to encrypt query strings
- Configure server to not log sensitive query parameters
- Implement token rotation

#### 3. Token Expiry
**Current**: Tokens don't expire (Django default)
**Enhancement**: Implement token refresh mechanism

```typescript
// Future enhancement: Token refresh
const refreshToken = async () => {
  try {
    const response = await api.post('/auth/refresh/');
    const { token } = response.data;
    useAuthStore.getState().setToken(token);
  } catch (error) {
    // Refresh failed, logout user
    useAuthStore.getState().logout();
  }
};
```

## Error Handling

### Network Errors
```typescript
const handleAuthError = (error: any) => {
  if (error.response?.status === 401) {
    // Token invalid or expired
    useAuthStore.getState().logout();
    throw new Error('Session expired. Please login again.');
  } else if (error.response?.status === 400) {
    // Invalid credentials
    throw new Error('Invalid username or password.');
  } else if (!error.response) {
    // Network error
    throw new Error('Network error. Please check your connection.');
  } else {
    // Other server errors
    throw new Error('Authentication failed. Please try again.');
  }
};
```

### Automatic Retry Logic
```typescript
// Retry mechanism for network failures
const loginWithRetry = async (credentials: LoginCredentials, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await authApi.login(credentials);
      return; // Success
    } catch (error) {
      if (attempt === maxRetries || error.response?.status === 401) {
        throw error; // Don't retry auth failures or final attempt
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};
```

## Development & Debugging

### Authentication State Debugging
```typescript
// Debug auth state
const DebugAuth = () => {
  const authState = useAuthStore();

  useEffect(() => {
    console.log('Auth State:', {
      isAuthenticated: authState.isAuthenticated,
      hasToken: !!authState.token,
      tokenLength: authState.token?.length,
      user: authState.user
    });
  }, [authState]);

  return null;
};
```

### Token Inspection
```javascript
// Inspect stored auth data
const inspectAuthStorage = () => {
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    const parsed = JSON.parse(authStorage);
    console.log('Stored auth data:', {
      hasToken: !!parsed.state?.token,
      tokenPrefix: parsed.state?.token?.substring(0, 10),
      user: parsed.state?.user,
      timestamp: parsed.state?.timestamp
    });
  }
};
```

### API Request Debugging
```javascript
// Log all API requests with auth headers
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', {
      url: config.url,
      method: config.method,
      hasAuthHeader: !!config.headers.Authorization,
      authHeaderPrefix: config.headers.Authorization?.substring(0, 15)
    });
    return config;
  }
);
```

## Testing Authentication

### Mock Authentication for Testing
```typescript
// Mock auth store for tests
export const createMockAuthStore = (isAuthenticated = true) => {
  return {
    token: isAuthenticated ? 'mock-token' : null,
    user: isAuthenticated ? { id: 1, username: 'testuser' } : null,
    isAuthenticated,
    login: jest.fn(),
    logout: jest.fn()
  };
};

// Use in tests
jest.mock('../stores/useAuthStore', () => ({
  useAuthStore: () => createMockAuthStore(true)
}));
```

### Integration Testing
```typescript
// Test protected route behavior
describe('Protected Routes', () => {
  it('redirects to login when not authenticated', () => {
    const { result } = renderHook(() => useAuthStore());

    // Mock unauthenticated state
    act(() => {
      result.current.logout();
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
  });
});
```

The authentication system provides secure, automatic token management with special handling for streaming endpoints while maintaining a clean development experience.