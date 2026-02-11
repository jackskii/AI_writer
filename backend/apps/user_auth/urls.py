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
    path('api/auth/edit-prefills/', views.list_edit_prefills_view, name='list_edit_prefills'),
    path('api/auth/edit-prefills/create/', views.create_edit_prefill_view, name='create_edit_prefill'),
    path('api/auth/edit-prefills/<int:prefill_id>/', views.update_edit_prefill_view, name='update_edit_prefill'),
    path('api/auth/edit-prefills/<int:prefill_id>/delete/', views.delete_edit_prefill_view, name='delete_edit_prefill'),
]