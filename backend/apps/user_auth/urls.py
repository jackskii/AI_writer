from django.urls import path
from . import views

urlpatterns = [
    path('api/auth/register/', views.register_view, name='register'),
    path('api/auth/login/', views.login_view, name='login'),
    path('api/auth/logout/', views.logout_view, name='logout'),
    path('api/auth/profile/', views.user_profile_view, name='profile'),
    path('api/auth/profile/update/', views.update_profile_view, name='update_profile'),
    path('api/auth/settings/', views.get_user_settings_view, name='get_settings'),
    path('api/auth/settings/update/', views.update_user_settings_view, name='update_settings'),
]