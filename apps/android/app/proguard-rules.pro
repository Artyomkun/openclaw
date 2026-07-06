# ============================================================
# OpenClaw Android ProGuard Rules
# ============================================================

-keep class com.openclaw.** { *; }
-keepclassmembers class com.openclaw.** { *; }
-keep class androidx.** { *; }
-keep class android.** { *; }
-dontwarn androidx.**
-keep class kotlin.** { *; }
-keep class kotlinx.** { *; }
-keepclassmembers class kotlin.** { *; }
-dontwarn kotlin.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class com.google.gson.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-dontwarn com.google.gson.**
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**
-keepattributes Signature
-keepattributes Exceptions
-keep class okhttp3.internal.ws.** { *; }
-dontwarn okhttp3.internal.ws.**
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
}
-optimizationpasses 5
-allowaccessmodification
-mergeinterfacesaggressively
-repackageclasses
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-dontwarn javax.**
-dontwarn sun.**
-dontwarn org.apache.**
-dontwarn org.slf4j.**
