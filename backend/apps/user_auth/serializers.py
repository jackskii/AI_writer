from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from .models import UserSettings


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'first_name', 'last_name')

    def validate_email(self, email):
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("该邮箱已被注册")
        return email

    def validate_username(self, username):
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("该用户名已被注册")
        return username

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("密码不匹配")
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField(help_text="用户名或邮箱")
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username_or_email = attrs.get('username')
        password = attrs.get('password')

        # Get request from context (needed for Django Axes)
        request = self.context.get('request')

        if username_or_email and password:
            # Try to find user by username first
            user = authenticate(request=request, username=username_or_email, password=password)

            # If not found, try to find user by email
            if not user:
                try:
                    user_obj = User.objects.get(email=username_or_email)
                    user = authenticate(request=request, username=user_obj.username, password=password)
                except User.DoesNotExist:
                    pass

            if not user:
                raise serializers.ValidationError('用户名/邮箱或密码错误')
            if not user.is_active:
                raise serializers.ValidationError('用户账户已被禁用')
            attrs['user'] = user
        else:
            raise serializers.ValidationError('请提供用户名/邮箱和密码')

        return attrs


class UserSerializer(serializers.ModelSerializer):
    works_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'date_joined', 'works_count')
        read_only_fields = ('id', 'date_joined', 'works_count')

    def get_works_count(self, obj):
        return obj.works.count()


class UserSettingsSerializer(serializers.ModelSerializer):
    deepseek_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    masked_api_key = serializers.SerializerMethodField(read_only=True)
    has_api_key = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = UserSettings
        fields = ('deepseek_api_key', 'masked_api_key', 'has_api_key', 'updated_at')
        read_only_fields = ('masked_api_key', 'has_api_key', 'updated_at')

    def get_masked_api_key(self, obj):
        """返回脱敏后的API密钥"""
        return obj.get_masked_api_key()

    def get_has_api_key(self, obj):
        """返回是否有有效的API密钥"""
        return obj.has_valid_api_key()

    def update(self, instance, validated_data):
        """更新API密钥"""
        if 'deepseek_api_key' in validated_data:
            api_key = validated_data.pop('deepseek_api_key')
            instance.deepseek_api_key = api_key
            instance.save()
        return instance