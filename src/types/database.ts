export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      active_workspace_preferences: {
        Row: {
          acting_role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          acting_role: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          acting_role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_workspace_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_workspace_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_configs: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data?: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_export_jobs: {
        Row: {
          created_at: string
          dataset: string
          expires_at: string
          filters: Json
          id: string
          requested_by: string
          status: string
        }
        Insert: {
          created_at?: string
          dataset: string
          expires_at?: string
          filters?: Json
          id?: string
          requested_by: string
          status?: string
        }
        Update: {
          created_at?: string
          dataset?: string
          expires_at?: string
          filters?: Json
          id?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_ops_issue_registry: {
        Row: {
          first_seen_at: string
          issue_key: string
          last_seen_at: string
        }
        Insert: {
          first_seen_at?: string
          issue_key: string
          last_seen_at?: string
        }
        Update: {
          first_seen_at?: string
          issue_key?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      admin_ops_issue_resolutions: {
        Row: {
          category: string | null
          checked_at: string | null
          checked_by: string | null
          detail: string | null
          issue_key: string
          reopened_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          checked_at?: string | null
          checked_by?: string | null
          detail?: string | null
          issue_key: string
          reopened_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          checked_at?: string | null
          checked_by?: string | null
          detail?: string | null
          issue_key?: string
          reopened_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_ops_issue_resolutions_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_ops_issue_resolutions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_store_server_notifications: {
        Row: {
          created_at: string
          environment: string | null
          last_error: string | null
          notification_type: string | null
          notification_uuid: string
          original_transaction_id: string | null
          processed_at: string | null
          signed_date: string | null
          status: string
          subtype: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          environment?: string | null
          last_error?: string | null
          notification_type?: string | null
          notification_uuid: string
          original_transaction_id?: string | null
          processed_at?: string | null
          signed_date?: string | null
          status?: string
          subtype?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: string | null
          last_error?: string | null
          notification_type?: string | null
          notification_uuid?: string
          original_transaction_id?: string | null
          processed_at?: string | null
          signed_date?: string | null
          status?: string
          subtype?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_store_server_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      apple_iap_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          environment: string
          expires_at: string | null
          last_signed_date: string | null
          latest_transaction_id: string
          original_transaction_id: string
          owner_id: string
          owner_type: string
          plan_key: string
          product_id: string
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          environment: string
          expires_at?: string | null
          last_signed_date?: string | null
          latest_transaction_id: string
          original_transaction_id: string
          owner_id: string
          owner_type: string
          plan_key: string
          product_id: string
          revoked_at?: string | null
          status: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          environment?: string
          expires_at?: string | null
          last_signed_date?: string | null
          latest_transaction_id?: string
          original_transaction_id?: string
          owner_id?: string
          owner_type?: string
          plan_key?: string
          product_id?: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apple_iap_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apple_iap_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_access_requests: {
        Row: {
          athlete_email: string | null
          athlete_id: string | null
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          athlete_email?: string | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          athlete_email?: string | null
          athlete_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_access_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_access_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_access_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_exercise_logs: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          exercise_id: string
          id: string
          logged_at: string
          notes: string | null
          program_id: string
          sets_data: Json
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          exercise_id: string
          id?: string
          logged_at?: string
          notes?: string | null
          program_id: string
          sets_data?: Json
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          logged_at?: string
          notes?: string | null
          program_id?: string
          sets_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "athlete_exercise_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "coach_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_exercise_logs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_guardian_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          athlete_id: string
          created_at: string
          created_by: string
          family_id: string
          id: string
          invited_email: string
          invited_role: string
          org_id: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          athlete_id: string
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          invited_email: string
          invited_role?: string
          org_id: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          athlete_id?: string
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          invited_email?: string
          invited_role?: string
          org_id?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_guardian_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_guardian_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_media: {
        Row: {
          athlete_id: string
          athlete_profile_id: string | null
          created_at: string
          id: string
          media_type: string
          media_url: string
          sub_profile_id: string | null
          title: string | null
        }
        Insert: {
          athlete_id: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url: string
          sub_profile_id?: string | null
          title?: string | null
        }
        Update: {
          athlete_id?: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          sub_profile_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_media_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_media_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_media_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_metric_snapshots: {
        Row: {
          athlete_id: string
          coach_id: string | null
          created_at: string | null
          id: string
          metric_label: string
          notes: string | null
          recorded_at: string
          source: string | null
          unit: string | null
          value: string
        }
        Insert: {
          athlete_id: string
          coach_id?: string | null
          created_at?: string | null
          id?: string
          metric_label: string
          notes?: string | null
          recorded_at?: string
          source?: string | null
          unit?: string | null
          value: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string | null
          created_at?: string | null
          id?: string
          metric_label?: string
          notes?: string | null
          recorded_at?: string
          source?: string | null
          unit?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_metric_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_metric_snapshots_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_metrics: {
        Row: {
          athlete_id: string
          athlete_profile_id: string | null
          created_at: string
          id: string
          label: string
          sort_order: number
          sub_profile_id: string | null
          unit: string | null
          value: string
        }
        Insert: {
          athlete_id: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          sub_profile_id?: string | null
          unit?: string | null
          value: string
        }
        Update: {
          athlete_id?: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          sub_profile_id?: string | null
          unit?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_metrics_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_metrics_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_metrics_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_notification_preferences: {
        Row: {
          athlete_id: string
          marketplace_updates: boolean
          messages: boolean
          payment_reminders: boolean
          schedule_changes: boolean
          updated_at: string
          waiver_reminders: boolean
        }
        Insert: {
          athlete_id: string
          marketplace_updates?: boolean
          messages?: boolean
          payment_reminders?: boolean
          schedule_changes?: boolean
          updated_at?: string
          waiver_reminders?: boolean
        }
        Update: {
          athlete_id?: string
          marketplace_updates?: boolean
          messages?: boolean
          payment_reminders?: boolean
          schedule_changes?: boolean
          updated_at?: string
          waiver_reminders?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "athlete_notification_preferences_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_organization_memberships: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_organization_memberships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "athlete_organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_payment_methods: {
        Row: {
          athlete_id: string
          autopay_day: string | null
          autopay_enabled: boolean
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          cardholder_name: string | null
          created_at: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          autopay_day?: string | null
          autopay_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          autopay_day?: string | null
          autopay_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_payment_methods_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_plans: {
        Row: {
          athlete_id: string
          created_at: string
          tier: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          tier: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_profile_legacy_map: {
        Row: {
          athlete_profile_id: string
          is_primary: boolean
          legacy_sub_profile_id: string | null
          owner_user_id: string
        }
        Insert: {
          athlete_profile_id: string
          is_primary?: boolean
          legacy_sub_profile_id?: string | null
          owner_user_id: string
        }
        Update: {
          athlete_profile_id?: string
          is_primary?: boolean
          legacy_sub_profile_id?: string | null
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_profile_legacy_map_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: true
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_profile_legacy_map_legacy_sub_profile_id_fkey"
            columns: ["legacy_sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_profile_legacy_map_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_profiles: {
        Row: {
          achievements: string[]
          athletic_goals: string | null
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          city: string | null
          competition_level: string | null
          coppa_consent_date: string | null
          coppa_consent_given: boolean
          coppa_consenting_parent_id: string | null
          created_at: string
          display_order: number
          duplicate_identity_confirmed: boolean
          family_id: string | null
          full_name: string
          gender: string | null
          grade_level: string | null
          graduation_year: number | null
          highlight_urls: string[]
          id: string
          is_primary: boolean
          is_test: boolean
          location: string | null
          owner_user_id: string | null
          performance_stats: string[]
          position: string | null
          season: string | null
          slug: string | null
          sport: string | null
          state: string | null
          status: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          achievements?: string[]
          athletic_goals?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          competition_level?: string | null
          coppa_consent_date?: string | null
          coppa_consent_given?: boolean
          coppa_consenting_parent_id?: string | null
          created_at?: string
          display_order?: number
          duplicate_identity_confirmed?: boolean
          family_id?: string | null
          full_name: string
          gender?: string | null
          grade_level?: string | null
          graduation_year?: number | null
          highlight_urls?: string[]
          id?: string
          is_primary?: boolean
          is_test?: boolean
          location?: string | null
          owner_user_id?: string | null
          performance_stats?: string[]
          position?: string | null
          season?: string | null
          slug?: string | null
          sport?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          achievements?: string[]
          athletic_goals?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          competition_level?: string | null
          coppa_consent_date?: string | null
          coppa_consent_given?: boolean
          coppa_consenting_parent_id?: string | null
          created_at?: string
          display_order?: number
          duplicate_identity_confirmed?: boolean
          family_id?: string | null
          full_name?: string
          gender?: string | null
          grade_level?: string | null
          graduation_year?: number | null
          highlight_urls?: string[]
          id?: string
          is_primary?: boolean
          is_test?: boolean
          location?: string | null
          owner_user_id?: string | null
          performance_stats?: string[]
          position?: string | null
          season?: string | null
          slug?: string | null
          sport?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_profiles_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_profiles_coppa_consenting_parent_id_fkey"
            columns: ["coppa_consenting_parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_profiles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_profiles_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_progress_notes: {
        Row: {
          athlete_id: string
          athlete_profile_id: string | null
          author_id: string | null
          created_at: string
          id: string
          note: string
          sub_profile_id: string | null
        }
        Insert: {
          athlete_id: string
          athlete_profile_id?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          note: string
          sub_profile_id?: string | null
        }
        Update: {
          athlete_id?: string
          athlete_profile_id?: string | null
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
          sub_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_progress_notes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_progress_notes_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_progress_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_progress_notes_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_results: {
        Row: {
          athlete_id: string
          athlete_profile_id: string | null
          created_at: string
          detail: string | null
          event_date: string | null
          id: string
          placement: string | null
          sub_profile_id: string | null
          title: string
        }
        Insert: {
          athlete_id: string
          athlete_profile_id?: string | null
          created_at?: string
          detail?: string | null
          event_date?: string | null
          id?: string
          placement?: string | null
          sub_profile_id?: string | null
          title: string
        }
        Update: {
          athlete_id?: string
          athlete_profile_id?: string | null
          created_at?: string
          detail?: string | null
          event_date?: string | null
          id?: string
          placement?: string | null
          sub_profile_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_results_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_results_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_saved_coaches: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_saved_coaches_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_saved_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_saved_programs: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          program_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          program_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_saved_programs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_saved_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_sub_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string
          grade_level: string | null
          id: string
          location: string | null
          name: string
          season: string | null
          sport: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          grade_level?: string | null
          id?: string
          location?: string | null
          name: string
          season?: string | null
          sport?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          grade_level?: string | null
          id?: string
          location?: string | null
          name?: string
          season?: string | null
          sport?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          org_id: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          capacity: number
          coach_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          location: string | null
          session_type: string | null
          specific_date: string | null
          start_time: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number
          coach_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          location?: string | null
          session_type?: string | null
          specific_date?: string | null
          start_time: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number
          coach_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          location?: string | null
          session_type?: string | null
          specific_date?: string | null
          start_time?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_policies: {
        Row: {
          frequency: string
          id: string
          notes: string | null
          provider: string
          retention_days: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          frequency?: string
          id?: string
          notes?: string | null
          provider?: string
          retention_days?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          frequency?: string
          id?: string
          notes?: string | null
          provider?: string
          retention_days?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_workspaces: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_test: boolean
          league_id: string | null
          organization_id: string | null
          owner_user_id: string | null
          status: string
          updated_at: string
          workspace_type: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_test?: boolean
          league_id?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          status?: string
          updated_at?: string
          workspace_type: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_test?: boolean
          league_id?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_workspaces_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "business_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_workspaces_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chargebacks: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string | null
          id: string
          metadata: Json | null
          payment_id: string | null
          reason: string | null
          status: string
          stripe_charge_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          reason?: string | null
          status?: string
          stripe_charge_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          reason?: string | null
          status?: string
          stripe_charge_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      churn_metrics: {
        Row: {
          athlete_churn_rate: number | null
          churn_rate: number | null
          coach_churn_rate: number | null
          created_at: string | null
          id: string
          month: string
        }
        Insert: {
          athlete_churn_rate?: number | null
          churn_rate?: number | null
          coach_churn_rate?: number | null
          created_at?: string | null
          id?: string
          month: string
        }
        Update: {
          athlete_churn_rate?: number | null
          churn_rate?: number | null
          coach_churn_rate?: number | null
          created_at?: string | null
          id?: string
          month?: string
        }
        Relationships: []
      }
      coach_athlete_links: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
          org_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_athlete_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_athlete_links_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_athlete_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "coach_athlete_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_booking_cancellation_requests: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          fee_id: string
          id: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          fee_id: string
          id?: string
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          fee_id?: string
          id?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_booking_cancellation_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_booking_cancellation_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_booking_cancellation_requests_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: true
            referencedRelation: "coach_fee_assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_booking_cancellation_requests_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: true
            referencedRelation: "coach_fee_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_document_requests: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          document_type: string
          due_at: string | null
          expires_at: string | null
          id: string
          org_id: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          document_type?: string
          due_at?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          document_type?: string
          due_at?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_document_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_document_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "coach_document_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_document_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_document_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_document_submissions: {
        Row: {
          content_type: string | null
          created_at: string
          file_sha256: string
          filename: string
          id: string
          note: string | null
          request_id: string
          storage_path: string
          submitted_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_sha256: string
          filename: string
          id?: string
          note?: string | null
          request_id: string
          storage_path: string
          submitted_by?: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_sha256?: string
          filename?: string
          id?: string
          note?: string | null
          request_id?: string
          storage_path?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_document_submissions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "coach_document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_document_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_exercises: {
        Row: {
          category: string | null
          coach_id: string
          created_at: string
          id: string
          instructions: string | null
          modality: string | null
          movement_pattern: string | null
          muscle_group: string | null
          name: string
          photo_paths: Json
          thumbnail_path: string | null
          tracking_fields: Json
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string | null
          coach_id: string
          created_at?: string
          id?: string
          instructions?: string | null
          modality?: string | null
          movement_pattern?: string | null
          muscle_group?: string | null
          name: string
          photo_paths?: Json
          thumbnail_path?: string | null
          tracking_fields?: Json
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          instructions?: string | null
          modality?: string | null
          movement_pattern?: string | null
          muscle_group?: string | null
          name?: string
          photo_paths?: Json
          thumbnail_path?: string | null
          tracking_fields?: Json
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      coach_fee_assignments: {
        Row: {
          amount: number | null
          athlete_id: string
          availability_block_id: string | null
          booking_notes: string | null
          booking_status: string
          canceled_at: string | null
          canceled_by: string | null
          cancellation_reason: string | null
          coach_id: string
          created_at: string | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          name: string
          payment_plan_enabled: boolean
          payment_plan_first_payment_cents: number | null
          payment_plan_frequency: string | null
          payment_plan_installments: number | null
          receipt_url: string | null
          requested_start_time: string | null
          rescheduled_at: string | null
          session_id: string | null
          session_type: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          amount?: number | null
          athlete_id: string
          availability_block_id?: string | null
          booking_notes?: string | null
          booking_status?: string
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          coach_id: string
          created_at?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          payment_plan_enabled?: boolean
          payment_plan_first_payment_cents?: number | null
          payment_plan_frequency?: string | null
          payment_plan_installments?: number | null
          receipt_url?: string | null
          requested_start_time?: string | null
          rescheduled_at?: string | null
          session_id?: string | null
          session_type?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount?: number | null
          athlete_id?: string
          availability_block_id?: string | null
          booking_notes?: string | null
          booking_status?: string
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          coach_id?: string
          created_at?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          payment_plan_enabled?: boolean
          payment_plan_first_payment_cents?: number | null
          payment_plan_frequency?: string | null
          payment_plan_installments?: number | null
          receipt_url?: string | null
          requested_start_time?: string | null
          rescheduled_at?: string | null
          session_id?: string | null
          session_type?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_fee_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fee_assignments_availability_block_id_fkey"
            columns: ["availability_block_id"]
            isOneToOne: false
            referencedRelation: "availability_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fee_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fee_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fee_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_invites: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          invited_email: string
          org_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          invited_email: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          invited_email?: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_invites_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "coach_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_membership_entitlements: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          entitlement_type: string
          id: string
          metadata: Json
          period_end: string
          period_start: string
          quantity: number
          subscription_id: string
          updated_at: string
          used_quantity: number
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          entitlement_type: string
          id?: string
          metadata?: Json
          period_end: string
          period_start: string
          quantity?: number
          subscription_id: string
          updated_at?: string
          used_quantity?: number
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          entitlement_type?: string
          id?: string
          metadata?: Json
          period_end?: string
          period_start?: string
          quantity?: number
          subscription_id?: string
          updated_at?: string
          used_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_membership_entitlements_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_entitlements_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_entitlements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "coach_membership_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_membership_plans: {
        Row: {
          billing_interval: string
          coach_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          included_sessions: number
          member_only_access: boolean
          metadata: Json | null
          name: string
          price_cents: number
          status: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          coach_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          included_sessions?: number
          member_only_access?: boolean
          metadata?: Json | null
          name: string
          price_cents: number
          status?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          coach_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          included_sessions?: number
          member_only_access?: boolean
          metadata?: Json | null
          name?: string
          price_cents?: number
          status?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_membership_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_membership_subscriptions: {
        Row: {
          athlete_id: string | null
          athlete_profile_id: string | null
          billing_period: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          coach_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          membership_id: string | null
          owner_user_id: string | null
          plan_id: string | null
          plan_name: string | null
          price_cents: number | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          athlete_profile_id?: string | null
          billing_period?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          coach_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          membership_id?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          price_cents?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          athlete_profile_id?: string | null
          billing_period?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          coach_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          membership_id?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          price_cents?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_membership_subscriptions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_subscriptions_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_subscriptions_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "coach_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_membership_usage: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          entitlement_id: string
          id: string
          notes: string | null
          quantity: number
          session_id: string | null
          subscription_id: string
          usage_type: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          entitlement_id: string
          id?: string
          notes?: string | null
          quantity?: number
          session_id?: string | null
          subscription_id: string
          usage_type?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          entitlement_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          session_id?: string | null
          subscription_id?: string
          usage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_membership_usage_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_usage_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_usage_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "coach_membership_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_usage_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_membership_usage_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "coach_membership_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          athlete_id: string
          attachment_content_type: string | null
          attachment_duration_seconds: number | null
          attachment_file_name: string | null
          attachment_size_bytes: number | null
          attachment_storage_path: string | null
          attachment_type: string | null
          coach_id: string
          content: string
          created_at: string
          id: string
          is_private: boolean
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          athlete_id: string
          attachment_content_type?: string | null
          attachment_duration_seconds?: number | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          attachment_storage_path?: string | null
          attachment_type?: string | null
          coach_id: string
          content: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          athlete_id?: string
          attachment_content_type?: string | null
          attachment_duration_seconds?: number | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          attachment_storage_path?: string | null
          attachment_type?: string | null
          coach_id?: string
          content?: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notification_preferences: {
        Row: {
          attendance_reminders: boolean
          coach_id: string
          marketplace_orders: boolean
          new_messages: boolean
          schedule_changes: boolean
          updated_at: string
          waiver_updates: boolean
        }
        Insert: {
          attendance_reminders?: boolean
          coach_id: string
          marketplace_orders?: boolean
          new_messages?: boolean
          schedule_changes?: boolean
          updated_at?: string
          waiver_updates?: boolean
        }
        Update: {
          attendance_reminders?: boolean
          coach_id?: string
          marketplace_orders?: boolean
          new_messages?: boolean
          schedule_changes?: boolean
          updated_at?: string
          waiver_updates?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "coach_notification_preferences_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_payouts: {
        Row: {
          amount: number
          coach_id: string
          created_at: string
          id: string
          paid_at: string | null
          scheduled_for: string | null
          session_payment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          coach_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          scheduled_for?: string | null
          session_payment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          coach_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          scheduled_for?: string | null
          session_payment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_payouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_payouts_session_payment_id_fkey"
            columns: ["session_payment_id"]
            isOneToOne: false
            referencedRelation: "session_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_plans: {
        Row: {
          coach_id: string
          created_at: string
          tier: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          tier: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_program_exercises: {
        Row: {
          coach_id: string
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          position: number
          program_id: string
          reps: string | null
          rest_seconds: number | null
          sets: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          position?: number
          program_id: string
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          program_id?: string
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "coach_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_program_exercises_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "coach_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_programs: {
        Row: {
          coach_id: string
          created_at: string
          description: string | null
          duration_label: string | null
          id: string
          product_id: string | null
          status: string
          thumbnail_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          product_id?: string | null
          status?: string
          thumbnail_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          description?: string | null
          duration_label?: string | null
          id?: string
          product_id?: string | null
          status?: string
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_programs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_reviews: {
        Row: {
          athlete_id: string | null
          body: string
          coach_id: string
          coach_response: string | null
          coach_response_at: string | null
          content: string | null
          created_at: string
          id: string
          is_public: boolean
          rating: number
          reviewer_name: string | null
          status: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          athlete_id?: string | null
          body: string
          coach_id: string
          coach_response?: string | null
          coach_response_at?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          rating: number
          reviewer_name?: string | null
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          athlete_id?: string | null
          body?: string
          coach_id?: string
          coach_response?: string | null
          coach_response_at?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          rating?: number
          reviewer_name?: string | null
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "coach_reviews_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_saved_athletes: {
        Row: {
          athlete_id: string
          coach_id: string
          created_at: string
          id: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          created_at?: string
          id?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_saved_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_saved_athletes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_training_plan_progress: {
        Row: {
          athlete_id: string
          completed_at: string | null
          id: string
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          completed_at?: string | null
          id?: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          completed_at?: string | null
          id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_training_plan_progress_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_training_plan_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "coach_training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_training_plans: {
        Row: {
          athlete_id: string
          coach_id: string
          content: string | null
          created_at: string
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_training_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_training_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_waiver_assignments: {
        Row: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          coach_id: string
          consent_version: string | null
          created_at: string
          electronic_consent_attested: boolean
          full_name: string | null
          id: string
          ip_address: string | null
          proof_generated_at: string | null
          sent_at: string
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_at: string | null
          signed_body_snapshot: string | null
          signed_by_user_id: string | null
          signed_coach_name_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          viewed_at: string | null
          waiver_id: string
          workspace_id: string | null
        }
        Insert: {
          athlete_id: string
          client_app_version?: string | null
          client_platform?: string | null
          coach_id: string
          consent_version?: string | null
          created_at?: string
          electronic_consent_attested?: boolean
          full_name?: string | null
          id?: string
          ip_address?: string | null
          proof_generated_at?: string | null
          sent_at?: string
          signature_audit?: Json | null
          signature_hash?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_body_snapshot?: string | null
          signed_by_user_id?: string | null
          signed_coach_name_snapshot?: string | null
          signed_file_sha256_snapshot?: string | null
          signed_pdf_sha256?: string | null
          signed_pdf_storage_path?: string | null
          signed_storage_path_snapshot?: string | null
          signed_title_snapshot?: string | null
          signer_authority_attested?: boolean
          signer_relationship?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          viewed_at?: string | null
          waiver_id: string
          workspace_id?: string | null
        }
        Update: {
          athlete_id?: string
          client_app_version?: string | null
          client_platform?: string | null
          coach_id?: string
          consent_version?: string | null
          created_at?: string
          electronic_consent_attested?: boolean
          full_name?: string | null
          id?: string
          ip_address?: string | null
          proof_generated_at?: string | null
          sent_at?: string
          signature_audit?: Json | null
          signature_hash?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_body_snapshot?: string | null
          signed_by_user_id?: string | null
          signed_coach_name_snapshot?: string | null
          signed_file_sha256_snapshot?: string | null
          signed_pdf_sha256?: string | null
          signed_pdf_storage_path?: string | null
          signed_storage_path_snapshot?: string | null
          signed_title_snapshot?: string | null
          signer_authority_attested?: boolean
          signer_relationship?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          viewed_at?: string | null
          waiver_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_waiver_assignments_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waiver_assignments_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "coach_waivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waiver_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_waiver_targets: {
        Row: {
          athlete_id: string | null
          created_at: string
          created_by: string | null
          id: string
          target_type: string
          team_id: string | null
          waiver_id: string
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          target_type: string
          team_id?: string | null
          waiver_id: string
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          target_type?: string
          team_id?: string | null
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_waiver_targets_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waiver_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waiver_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waiver_targets_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "coach_waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_waivers: {
        Row: {
          archived_at: string | null
          body: string | null
          coach_id: string
          created_at: string
          due_at: string | null
          effective_at: string | null
          expires_at: string | null
          file_name: string | null
          file_path: string | null
          file_sha256: string | null
          file_size: number | null
          file_type: string | null
          id: string
          is_active: boolean
          lifecycle_status: string
          season_label: string | null
          source_type: string
          storage_path: string | null
          supersedes_id: string | null
          title: string
          updated_at: string
          url: string | null
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          coach_id: string
          created_at?: string
          due_at?: string | null
          effective_at?: string | null
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          season_label?: string | null
          source_type?: string
          storage_path?: string | null
          supersedes_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
          version_number?: number
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          coach_id?: string
          created_at?: string
          due_at?: string | null
          effective_at?: string | null
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          season_label?: string | null
          source_type?: string
          storage_path?: string | null
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_waivers_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "coach_waivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_waivers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          label: string
          start_date: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          label: string
          start_date?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          label?: string
          start_date?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          admin_notes: string | null
          content_id: string | null
          content_type: string
          created_at: string
          details: string | null
          id: string
          profile_owner_id: string | null
          profile_owner_type: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          details?: string | null
          id?: string
          profile_owner_id?: string | null
          profile_owner_type?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          details?: string | null
          id?: string
          profile_owner_id?: string | null
          profile_owner_type?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          hidden_sections: string[]
          page: string
          updated_at: string
          user_id: string
        }
        Insert: {
          hidden_sections?: string[]
          page: string
          updated_at?: string
          user_id: string
        }
        Update: {
          hidden_sections?: string[]
          page?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_audit_log: {
        Row: {
          action: string
          changes: Json
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          date_column: string
          enabled: boolean
          id: string
          retention_days: number
          table_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          date_column?: string
          enabled?: boolean
          id?: string
          retention_days?: number
          table_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          date_column?: string
          enabled?: boolean
          id?: string
          retention_days?: number
          table_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_runs: {
        Row: {
          created_at: string
          cutoff: string
          deleted_count: number
          id: string
          run_by: string | null
          table_name: string
        }
        Insert: {
          created_at?: string
          cutoff: string
          deleted_count?: number
          id?: string
          run_by?: string | null
          table_name: string
        }
        Update: {
          created_at?: string
          cutoff?: string
          deleted_count?: number
          id?: string
          run_by?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_retention_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_signal_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          role: string | null
          signal: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          role?: string | null
          signal: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          role?: string | null
          signal?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_signal_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          active: boolean
          created_at: string
          environment: string
          id: string
          invalidated_at: string | null
          last_seen_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          environment?: string
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          environment?: string
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          chargeback_id: string | null
          created_at: string | null
          description: string | null
          file_url: string | null
          id: string
          submitted_by: string | null
        }
        Insert: {
          chargeback_id?: string | null
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          submitted_by?: string | null
        }
        Update: {
          chargeback_id?: string | null
          created_at?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_chargeback_id_fkey"
            columns: ["chargeback_id"]
            isOneToOne: false
            referencedRelation: "chargebacks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          bounced_at: string | null
          created_at: string | null
          delivered_at: string | null
          error: string | null
          from_email: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          opened_at: string | null
          provider: string
          sent_at: string | null
          status: string
          subject: string | null
          template: string | null
          to_email: string | null
          to_name: string | null
          updated_at: string | null
        }
        Insert: {
          bounced_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error?: string | null
          from_email?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          provider?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string | null
        }
        Update: {
          bounced_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error?: string | null
          from_email?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          provider?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          message_id: string | null
          occurred_at: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          message_id?: string | null
          occurred_at?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          message_id?: string | null
          occurred_at?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          athlete_id: string
          contact_index: number
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          contact_index: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          contact_index?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          active: boolean
          address: string | null
          advance_notice_hours: number
          cancellation_policy: string | null
          cancellation_window_hours: number
          created_at: string
          description: string | null
          id: string
          late_cancellation_fee_cents: number
          marketplace_fee_cap_cents: number
          marketplace_fee_rate: number
          minimum_minutes: number
          name: string
          org_id: string | null
          owner_user_id: string | null
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          advance_notice_hours?: number
          cancellation_policy?: string | null
          cancellation_window_hours?: number
          created_at?: string
          description?: string | null
          id?: string
          late_cancellation_fee_cents?: number
          marketplace_fee_cap_cents?: number
          marketplace_fee_rate?: number
          minimum_minutes?: number
          name: string
          org_id?: string | null
          owner_user_id?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          advance_notice_hours?: number
          cancellation_policy?: string | null
          cancellation_window_hours?: number
          created_at?: string
          description?: string | null
          id?: string
          late_cancellation_fee_cents?: number
          marketplace_fee_cap_cents?: number
          marketplace_fee_rate?: number
          minimum_minutes?: number
          name?: string
          org_id?: string | null
          owner_user_id?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "facilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facilities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_bookings: {
        Row: {
          amount_cents: number
          booked_by_org_id: string | null
          booked_by_user_id: string | null
          cancellation_fee_cents: number
          created_at: string
          duration_minutes: number
          ends_at: string
          facility_id: string
          id: string
          rate_per_hour_cents: number
          refunded_amount_cents: number
          space_id: string
          starts_at: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booked_by_org_id?: string | null
          booked_by_user_id?: string | null
          cancellation_fee_cents?: number
          created_at?: string
          duration_minutes: number
          ends_at: string
          facility_id: string
          id?: string
          rate_per_hour_cents: number
          refunded_amount_cents?: number
          space_id: string
          starts_at: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booked_by_org_id?: string | null
          booked_by_user_id?: string | null
          cancellation_fee_cents?: number
          created_at?: string
          duration_minutes?: number
          ends_at?: string
          facility_id?: string
          id?: string
          rate_per_hour_cents?: number
          refunded_amount_cents?: number
          space_id?: string
          starts_at?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_bookings_booked_by_org_id_fkey"
            columns: ["booked_by_org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "facility_bookings_booked_by_org_id_fkey"
            columns: ["booked_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_bookings_booked_by_user_id_fkey"
            columns: ["booked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_bookings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "facility_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_bookings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_spaces: {
        Row: {
          active: boolean
          created_at: string
          facility_id: string
          hourly_rate_cents: number
          id: string
          metadata: Json
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          facility_id: string
          hourly_rate_cents: number
          id?: string
          metadata?: Json
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          facility_id?: string
          hourly_rate_cents?: number
          id?: string
          metadata?: Json
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_spaces_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          city: string | null
          created_at: string
          id: string
          primary_contact_id: string | null
          state: string | null
          status: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          primary_contact_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          primary_contact_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "families_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          family_id: string
          id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_payment_plan_enrollments: {
        Row: {
          amount_paid_cents: number
          athlete_profile_id: string
          autopay_consent_at: string
          autopay_consent_checkout_session_id: string | null
          autopay_consent_confirmed_at: string | null
          autopay_consent_ip_hash: string | null
          autopay_consent_text: string | null
          autopay_consent_user_agent: string | null
          coach_id: string | null
          consent_text_version: string
          created_at: string
          frequency: string
          id: string
          installment_count: number
          org_id: string | null
          payer_id: string
          source_id: string
          source_type: string
          status: string
          stripe_connected_account_id: string | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          total_amount_cents: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount_paid_cents?: number
          athlete_profile_id: string
          autopay_consent_at: string
          autopay_consent_checkout_session_id?: string | null
          autopay_consent_confirmed_at?: string | null
          autopay_consent_ip_hash?: string | null
          autopay_consent_text?: string | null
          autopay_consent_user_agent?: string | null
          coach_id?: string | null
          consent_text_version?: string
          created_at?: string
          frequency: string
          id?: string
          installment_count: number
          org_id?: string | null
          payer_id: string
          source_id: string
          source_type: string
          status?: string
          stripe_connected_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          total_amount_cents: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount_paid_cents?: number
          athlete_profile_id?: string
          autopay_consent_at?: string
          autopay_consent_checkout_session_id?: string | null
          autopay_consent_confirmed_at?: string | null
          autopay_consent_ip_hash?: string | null
          autopay_consent_text?: string | null
          autopay_consent_user_agent?: string | null
          coach_id?: string | null
          consent_text_version?: string
          created_at?: string
          frequency?: string
          id?: string
          installment_count?: number
          org_id?: string | null
          payer_id?: string
          source_id?: string
          source_type?: string
          status?: string
          stripe_connected_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          total_amount_cents?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_payment_plan_enrollments_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_payment_plan_enrollments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_payment_plan_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "family_payment_plan_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_payment_plan_enrollments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_payment_plan_enrollments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      family_payment_plan_installments: {
        Row: {
          amount_cents: number
          attempt_count: number
          created_at: string
          due_at: string
          enrollment_id: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          sequence_number: number
          status: string
          stripe_payment_intent_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempt_count?: number
          created_at?: string
          due_at: string
          enrollment_id: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          sequence_number: number
          status?: string
          stripe_payment_intent_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempt_count?: number
          created_at?: string
          due_at?: string
          enrollment_id?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          sequence_number?: number
          status?: string
          stripe_payment_intent_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_payment_plan_installments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "family_payment_plan_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_payment_plan_installments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      family_subscription_athletes: {
        Row: {
          athlete_profile_id: string
          created_at: string
          id: string
          subscription_owner_id: string
        }
        Insert: {
          athlete_profile_id: string
          created_at?: string
          id?: string
          subscription_owner_id: string
        }
        Update: {
          athlete_profile_id?: string
          created_at?: string
          id?: string
          subscription_owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_subscription_athletes_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: true
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_subscription_athletes_subscription_owner_id_fkey"
            columns: ["subscription_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          flag: string
          id: string
          notes: string | null
          severity: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          flag: string
          id?: string
          notes?: string | null
          severity?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          flag?: string
          id?: string
          notes?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      fundraising_campaigns: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deadline: string | null
          description: string | null
          goal_amount_cents: number
          id: string
          is_tax_deductible: boolean
          name: string
          org_id: string
          slug: string
          suggested_amounts_cents: number[]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          goal_amount_cents: number
          id?: string
          is_tax_deductible?: boolean
          name: string
          org_id: string
          slug: string
          suggested_amounts_cents?: number[]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          goal_amount_cents?: number
          id?: string
          is_tax_deductible?: boolean
          name?: string
          org_id?: string
          slug?: string
          suggested_amounts_cents?: number[]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_contributions: {
        Row: {
          amount_cents: number
          anonymous: boolean
          campaign_id: string
          contributor_email: string | null
          contributor_id: string | null
          contributor_name: string | null
          contributor_type: string
          created_at: string
          id: string
          transaction_id: string | null
        }
        Insert: {
          amount_cents: number
          anonymous?: boolean
          campaign_id: string
          contributor_email?: string | null
          contributor_id?: string | null
          contributor_name?: string | null
          contributor_type: string
          created_at?: string
          id?: string
          transaction_id?: string | null
        }
        Update: {
          amount_cents?: number
          anonymous?: boolean
          campaign_id?: string
          contributor_email?: string | null
          contributor_id?: string | null
          contributor_name?: string | null
          contributor_type?: string
          created_at?: string
          id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fundraising_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_contributions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      independent_coach_profiles: {
        Row: {
          booking_enabled: boolean
          booking_url: string | null
          camp_price_cents: number | null
          coach_id: string
          created_at: string
          group_session_price_cents: number | null
          id: string
          in_person_available: boolean
          is_active: boolean
          memberships: Json
          pricing_summary: string | null
          remote_available: boolean
          services: string[]
          session_policy: string | null
          session_price_cents: number | null
          testimonials: string[]
          training_locations: string[]
          trial_policy: string | null
          updated_at: string
        }
        Insert: {
          booking_enabled?: boolean
          booking_url?: string | null
          camp_price_cents?: number | null
          coach_id: string
          created_at?: string
          group_session_price_cents?: number | null
          id?: string
          in_person_available?: boolean
          is_active?: boolean
          memberships?: Json
          pricing_summary?: string | null
          remote_available?: boolean
          services?: string[]
          session_policy?: string | null
          session_price_cents?: number | null
          testimonials?: string[]
          training_locations?: string[]
          trial_policy?: string | null
          updated_at?: string
        }
        Update: {
          booking_enabled?: boolean
          booking_url?: string | null
          camp_price_cents?: number | null
          coach_id?: string
          created_at?: string
          group_session_price_cents?: number | null
          id?: string
          in_person_available?: boolean
          is_active?: boolean
          memberships?: Json
          pricing_summary?: string | null
          remote_available?: boolean
          services?: string[]
          session_policy?: string | null
          session_price_cents?: number | null
          testimonials?: string[]
          training_locations?: string[]
          trial_policy?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "independent_coach_profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount_cents: number
          description: string | null
          id: string
          invoice_id: string | null
          quantity: number | null
        }
        Insert: {
          amount_cents: number
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
        }
        Update: {
          amount_cents?: number
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          total_cents: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          total_cents?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          total_cents?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_access_invitations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          invited_email: string
          league_id: string
          request_type: string
          requested_by: string | null
          responded_at: string | null
          responded_by: string | null
          scope_id: string
          scope_type: string
          status: string
          target_role: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invited_email: string
          league_id: string
          request_type?: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          scope_id: string
          scope_type: string
          status?: string
          target_role: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invited_email?: string
          league_id?: string
          request_type?: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          scope_id?: string
          scope_type?: string
          status?: string
          target_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_access_invitations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_access_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_access_invitations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_access_invitations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_access_invitations_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_access_settings: {
        Row: {
          assigner_roles: string[]
          combined_roles_allowed: boolean
          default_access: string
          invitations_required: boolean
          league_id: string
          secondary_approval_required: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigner_roles?: string[]
          combined_roles_allowed?: boolean
          default_access?: string
          invitations_required?: boolean
          league_id: string
          secondary_approval_required?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigner_roles?: string[]
          combined_roles_allowed?: boolean
          default_access?: string
          invitations_required?: boolean
          league_id?: string
          secondary_approval_required?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_access_settings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_access_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_announcements: {
        Row: {
          audience: string
          audience_id: string | null
          body: string
          created_by: string
          id: string
          league_id: string
          published_at: string
          season_id: string | null
          title: string
        }
        Insert: {
          audience?: string
          audience_id?: string | null
          body: string
          created_by: string
          id?: string
          league_id: string
          published_at?: string
          season_id?: string | null
          title: string
        }
        Update: {
          audience?: string
          audience_id?: string | null
          body?: string
          created_by?: string
          id?: string
          league_id?: string
          published_at?: string
          season_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_announcements_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_announcements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_audit_events: {
        Row: {
          actor_user_id: string | null
          event_type: string
          id: string
          league_id: string
          metadata: Json
          occurred_at: string
          record_id: string | null
          record_type: string | null
        }
        Insert: {
          actor_user_id?: string | null
          event_type: string
          id?: string
          league_id: string
          metadata?: Json
          occurred_at?: string
          record_id?: string | null
          record_type?: string | null
        }
        Update: {
          actor_user_id?: string | null
          event_type?: string
          id?: string
          league_id?: string
          metadata?: Json
          occurred_at?: string
          record_id?: string | null
          record_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_audit_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_divisions: {
        Row: {
          age_group: string | null
          competition_level: string | null
          created_at: string
          id: string
          league_id: string
          name: string
          season_id: string | null
        }
        Insert: {
          age_group?: string | null
          competition_level?: string | null
          created_at?: string
          id?: string
          league_id: string
          name: string
          season_id?: string | null
        }
        Update: {
          age_group?: string | null
          competition_level?: string | null
          created_at?: string
          id?: string
          league_id?: string
          name?: string
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_divisions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_document_submissions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          league_id: string
          notes: string | null
          org_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          submitted_by: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          league_id: string
          notes?: string | null
          org_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          submitted_by?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          league_id?: string
          notes?: string | null
          org_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          submitted_by?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_document_submissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "league_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_document_submissions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_document_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_document_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_document_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_document_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_document_submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_documents: {
        Row: {
          created_at: string
          document_type: string
          due_at: string | null
          id: string
          is_required: boolean
          league_id: string
          season_id: string | null
          storage_path: string | null
          target_type: string
          title: string
        }
        Insert: {
          created_at?: string
          document_type: string
          due_at?: string | null
          id?: string
          is_required?: boolean
          league_id: string
          season_id?: string | null
          storage_path?: string | null
          target_type: string
          title: string
        }
        Update: {
          created_at?: string
          document_type?: string
          due_at?: string | null
          id?: string
          is_required?: boolean
          league_id?: string
          season_id?: string | null
          storage_path?: string | null
          target_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_documents_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_documents_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fee_assignments: {
        Row: {
          amount_cents: number
          athlete_id: string | null
          created_at: string
          due_at: string | null
          fee_id: string
          id: string
          league_id: string
          org_id: string | null
          paid_at: string | null
          paid_cents: number
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          athlete_id?: string | null
          created_at?: string
          due_at?: string | null
          fee_id: string
          id?: string
          league_id: string
          org_id?: string | null
          paid_at?: string | null
          paid_cents?: number
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          athlete_id?: string | null
          created_at?: string
          due_at?: string | null
          fee_id?: string
          id?: string
          league_id?: string
          org_id?: string | null
          paid_at?: string | null
          paid_cents?: number
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_fee_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fee_assignments_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "league_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fee_assignments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fee_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_fee_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_fees: {
        Row: {
          amount_cents: number
          created_at: string
          due_at: string | null
          id: string
          league_id: string
          org_id: string | null
          season_id: string | null
          status: string
          title: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          due_at?: string | null
          id?: string
          league_id: string
          org_id?: string | null
          season_id?: string | null
          status?: string
          title: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          due_at?: string | null
          id?: string
          league_id?: string
          org_id?: string | null
          season_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_fees_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_fees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_fees_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_games: {
        Row: {
          away_score: number | null
          away_team_id: string
          division_id: string | null
          home_score: number | null
          home_team_id: string
          id: string
          league_id: string
          location: string | null
          season_id: string
          starts_at: string
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          division_id?: string | null
          home_score?: number | null
          home_team_id: string
          id?: string
          league_id: string
          location?: string | null
          season_id: string
          starts_at: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          division_id?: string | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          league_id?: string
          location?: string | null
          season_id?: string
          starts_at?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_games_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_games_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_games_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_memberships: {
        Row: {
          created_at: string
          id: string
          league_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_organizations: {
        Row: {
          id: string
          joined_at: string | null
          league_id: string
          org_id: string
          status: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          league_id: string
          org_id: string
          status?: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          league_id?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_organizations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_organizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_organizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_permissions: {
        Row: {
          created_at: string
          id: string
          league_id: string
          membership_id: string
          permissions: Json
          scope_id: string | null
          scope_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          membership_id: string
          permissions?: Json
          scope_id?: string | null
          scope_type: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          membership_id?: string
          permissions?: Json
          scope_id?: string | null
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_permissions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_permissions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "league_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      league_registrations: {
        Row: {
          athlete_id: string
          id: string
          league_id: string
          org_id: string
          registered_at: string
          season_id: string
          status: string
          team_id: string | null
        }
        Insert: {
          athlete_id: string
          id?: string
          league_id: string
          org_id: string
          registered_at?: string
          season_id: string
          status?: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string
          id?: string
          league_id?: string
          org_id?: string
          registered_at?: string
          season_id?: string
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_registrations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_registrations_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          league_id: string
          name: string
          registration_status: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          league_id: string
          name: string
          registration_status?: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          league_id?: string
          name?: string
          registration_status?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_team_assignments: {
        Row: {
          created_at: string
          division_id: string | null
          id: string
          league_id: string
          org_id: string
          season_id: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          division_id?: string | null
          id?: string
          league_id: string
          org_id: string
          season_id: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          division_id?: string | null
          id?: string
          league_id?: string
          org_id?: string
          season_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_team_assignments_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_assignments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "league_team_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_assignments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          billing_model: string
          created_at: string
          general_location: string | null
          id: string
          max_teams: number
          name: string
          sport: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_model?: string
          created_at?: string
          general_location?: string | null
          id?: string
          max_teams?: number
          name: string
          sport?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_model?: string
          created_at?: string
          general_location?: string | null
          id?: string
          max_teams?: number
          name?: string
          sport?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ltv_snapshots: {
        Row: {
          created_at: string | null
          id: string
          last_order_date: string | null
          total_spend_cents: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          total_spend_cents?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_order_date?: string | null
          total_spend_cents?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ltv_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_items: {
        Row: {
          coach_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          inventory_count: number | null
          is_active: boolean
          item_type: string
          name: string
          org_id: string | null
          price: number
          purchase_url: string | null
          seller_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_active?: boolean
          item_type?: string
          name: string
          org_id?: string | null
          price?: number
          purchase_url?: string | null
          seller_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_active?: boolean
          item_type?: string
          name?: string
          org_id?: string | null
          price?: number
          purchase_url?: string | null
          seller_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_items_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "marketplace_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          amount: number
          buyer_id: string | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          coach_id: string | null
          created_at: string
          delivery_status: string | null
          fulfilled_at: string | null
          fulfillment_status: string
          id: string
          item_id: string | null
          org_id: string | null
          payment_status: string | null
          receipt_url: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          coach_id?: string | null
          created_at?: string
          delivery_status?: string | null
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          item_id?: string | null
          org_id?: string | null
          payment_status?: string | null
          receipt_url?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          coach_id?: string | null
          created_at?: string
          delivery_status?: string | null
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          item_id?: string | null
          org_id?: string | null
          payment_status?: string | null
          receipt_url?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "marketplace_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          message_id: string | null
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason: string
          reporter_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          created_at: string
          delivered_at: string | null
          message_id: string
          read_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          message_id: string
          read_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          message_id?: string
          read_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_content_type: string | null
          attachment_duration_seconds: number | null
          attachment_file_name: string | null
          attachment_size_bytes: number | null
          attachment_storage_path: string | null
          attachment_type: string | null
          body: string | null
          content: string
          created_at: string | null
          id: string
          sender_id: string | null
          thread_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attachment_content_type?: string | null
          attachment_duration_seconds?: number | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          attachment_storage_path?: string | null
          attachment_type?: string | null
          body?: string | null
          content: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          thread_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attachment_content_type?: string | null
          attachment_duration_seconds?: number | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          attachment_storage_path?: string | null
          attachment_type?: string | null
          body?: string | null
          content?: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          thread_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_checkout_handoffs: {
        Row: {
          checkout_type: string
          checkout_url: string | null
          created_at: string
          expires_at: string
          fulfilled_at: string | null
          last_error: string | null
          metadata: Json
          nonce: string
          resource_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          token_expires_at: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          checkout_type: string
          checkout_url?: string | null
          created_at?: string
          expires_at: string
          fulfilled_at?: string | null
          last_error?: string | null
          metadata?: Json
          nonce: string
          resource_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          token_expires_at: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          checkout_type?: string
          checkout_url?: string | null
          created_at?: string
          expires_at?: string
          fulfilled_at?: string | null
          last_error?: string | null
          metadata?: Json
          nonce?: string
          resource_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_checkout_handoffs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_checkout_handoffs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_tasks: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          max_attempts: number
          metadata: Json | null
          next_run_at: string
          owner: string
          priority: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json | null
          next_run_at?: string
          owner?: string
          priority?: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json | null
          next_run_at?: string
          owner?: string
          priority?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_disputes: {
        Row: {
          amount: number | null
          charge_id: string | null
          created_at: string
          currency: string | null
          dispute_id: string
          evidence_due_by: string | null
          fee_assignment_id: string | null
          id: string
          order_id: string | null
          payment_intent_id: string | null
          reason: string | null
          status: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          dispute_id: string
          evidence_due_by?: string | null
          fee_assignment_id?: string | null
          id?: string
          order_id?: string | null
          payment_intent_id?: string | null
          reason?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          dispute_id?: string
          evidence_due_by?: string | null
          fee_assignment_id?: string | null
          id?: string
          order_id?: string | null
          payment_intent_id?: string | null
          reason?: string | null
          status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_disputes_fee_assignment_id_fkey"
            columns: ["fee_assignment_id"]
            isOneToOne: false
            referencedRelation: "org_fee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_disputes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refund_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string | null
          requester_id: string
          resolved_at: string | null
          resolver_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          reason?: string | null
          requester_id: string
          resolved_at?: string | null
          resolver_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          reason?: string | null
          requester_id?: string
          resolved_at?: string | null
          resolver_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_requests_resolver_id_fkey"
            columns: ["resolver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_cents: number | null
          athlete_id: string | null
          coach_id: string | null
          created_at: string | null
          delivered_at: string | null
          fulfillment_notes: string | null
          fulfillment_status: string | null
          id: string
          net_amount: number | null
          net_cents: number | null
          org_id: string | null
          payment_intent_id: string | null
          platform_fee: number | null
          platform_fee_cents: number | null
          platform_fee_rate: number | null
          product_id: string | null
          refund_amount: number | null
          refund_reason: string | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_at: string | null
          seller_id: string | null
          seller_type: string | null
          shipping_address: string | null
          status: string | null
          stripe_processing_fee_cents: number | null
          total_cents: number | null
          tracking_number: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          fulfillment_notes?: string | null
          fulfillment_status?: string | null
          id?: string
          net_amount?: number | null
          net_cents?: number | null
          org_id?: string | null
          payment_intent_id?: string | null
          platform_fee?: number | null
          platform_fee_cents?: number | null
          platform_fee_rate?: number | null
          product_id?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          seller_id?: string | null
          seller_type?: string | null
          shipping_address?: string | null
          status?: string | null
          stripe_processing_fee_cents?: number | null
          total_cents?: number | null
          tracking_number?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          fulfillment_notes?: string | null
          fulfillment_status?: string | null
          id?: string
          net_amount?: number | null
          net_cents?: number | null
          org_id?: string | null
          payment_intent_id?: string | null
          platform_fee?: number | null
          platform_fee_cents?: number | null
          platform_fee_rate?: number | null
          product_id?: string | null
          refund_amount?: number | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          seller_id?: string | null
          seller_type?: string | null
          shipping_address?: string | null
          status?: string | null
          stripe_processing_fee_cents?: number | null
          total_cents?: number | null
          tracking_number?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_athlete_fk"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_age_groups: {
        Row: {
          created_at: string
          id: string
          max_age: number | null
          min_age: number | null
          name: string
          notes: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_age?: number | null
          min_age?: number | null
          name: string
          notes?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_age_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_age_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_announcement_recipients: {
        Row: {
          announcement_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "org_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_announcement_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_announcements: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          team_ids: string[]
          title: string
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          team_ids?: string[]
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          team_ids?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          org_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      org_coach_billing_snapshots: {
        Row: {
          active_coach_count: number
          additional_coach_count: number
          captured_at: string
          coach_ids: string[]
          id: string
          included_coach_count: number
          org_id: string
          reasons: Json
          subscription_id: string | null
        }
        Insert: {
          active_coach_count?: number
          additional_coach_count?: number
          captured_at?: string
          coach_ids?: string[]
          id?: string
          included_coach_count?: number
          org_id: string
          reasons?: Json
          subscription_id?: string | null
        }
        Update: {
          active_coach_count?: number
          additional_coach_count?: number
          captured_at?: string
          coach_ids?: string[]
          id?: string
          included_coach_count?: number
          org_id?: string
          reasons?: Json
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_coach_billing_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_coach_billing_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_coach_billing_snapshots_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_compliance_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          org_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_compliance_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_compliance_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_compliance_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_compliance_uploads: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          org_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          org_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          org_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_compliance_uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_compliance_uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_compliance_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_document_completions: {
        Row: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          completed_at: string
          consent_version: string | null
          created_at: string
          document_id: string
          electronic_consent_attested: boolean
          id: string
          proof_generated_at: string | null
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_by_user_id: string | null
          signed_external_url_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_org_name_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          workspace_id: string | null
        }
        Insert: {
          athlete_id: string
          client_app_version?: string | null
          client_platform?: string | null
          completed_at?: string
          consent_version?: string | null
          created_at?: string
          document_id: string
          electronic_consent_attested?: boolean
          id?: string
          proof_generated_at?: string | null
          signature_audit?: Json | null
          signature_hash?: string | null
          signature_name?: string | null
          signed_by_user_id?: string | null
          signed_external_url_snapshot?: string | null
          signed_file_sha256_snapshot?: string | null
          signed_org_name_snapshot?: string | null
          signed_pdf_sha256?: string | null
          signed_pdf_storage_path?: string | null
          signed_storage_path_snapshot?: string | null
          signed_title_snapshot?: string | null
          signer_authority_attested?: boolean
          signer_relationship?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          athlete_id?: string
          client_app_version?: string | null
          client_platform?: string | null
          completed_at?: string
          consent_version?: string | null
          created_at?: string
          document_id?: string
          electronic_consent_attested?: boolean
          id?: string
          proof_generated_at?: string | null
          signature_audit?: Json | null
          signature_hash?: string | null
          signature_name?: string | null
          signed_by_user_id?: string | null
          signed_external_url_snapshot?: string | null
          signed_file_sha256_snapshot?: string | null
          signed_org_name_snapshot?: string | null
          signed_pdf_sha256?: string | null
          signed_pdf_storage_path?: string | null
          signed_storage_path_snapshot?: string | null
          signed_title_snapshot?: string | null
          signer_authority_attested?: boolean
          signer_relationship?: string | null
          status?: string
          updated_at?: string
          upload_url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_document_completions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_completions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "org_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_completions_signed_by_user_id_fkey"
            columns: ["signed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_completions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_document_targets: {
        Row: {
          athlete_id: string | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          target_type: string
          team_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          target_type: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          target_type?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_document_targets_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_targets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "org_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_document_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_documents: {
        Row: {
          archived_at: string | null
          created_at: string
          document_type: string
          due_at: string | null
          effective_at: string | null
          expires_at: string | null
          file_sha256: string | null
          id: string
          is_required: boolean
          lifecycle_status: string
          org_id: string
          season_label: string | null
          storage_path: string | null
          supersedes_id: string | null
          title: string
          updated_at: string
          url: string | null
          version_number: number
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          document_type?: string
          due_at?: string | null
          effective_at?: string | null
          expires_at?: string | null
          file_sha256?: string | null
          id?: string
          is_required?: boolean
          lifecycle_status?: string
          org_id: string
          season_label?: string | null
          storage_path?: string | null
          supersedes_id?: string | null
          title: string
          updated_at?: string
          url?: string | null
          version_number?: number
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          document_type?: string
          due_at?: string | null
          effective_at?: string | null
          expires_at?: string | null
          file_sha256?: string | null
          id?: string
          is_required?: boolean
          lifecycle_status?: string
          org_id?: string
          season_label?: string | null
          storage_path?: string | null
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          version_number?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "org_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_dues_installments: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          autopay: boolean
          created_at: string
          due_at: string
          family_account_id: string | null
          id: string
          last_retry_at: string | null
          metadata: Json
          player_id: string
          retry_count: number
          schedule_id: string
          sequence_number: number
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
        }
        Insert: {
          amount_due_cents: number
          amount_paid_cents?: number
          autopay?: boolean
          created_at?: string
          due_at: string
          family_account_id?: string | null
          id?: string
          last_retry_at?: string | null
          metadata?: Json
          player_id: string
          retry_count?: number
          schedule_id: string
          sequence_number: number
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          autopay?: boolean
          created_at?: string
          due_at?: string
          family_account_id?: string | null
          id?: string
          last_retry_at?: string | null
          metadata?: Json
          player_id?: string
          retry_count?: number
          schedule_id?: string
          sequence_number?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_dues_installments_family_account_id_fkey"
            columns: ["family_account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_dues_installments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_dues_installments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "org_dues_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      org_dues_retry_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string | null
          created_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          installment_id: string
          outcome: string
          scheduled_for: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          attempt_number: number
          attempted_at?: string | null
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          installment_id: string
          outcome?: string
          scheduled_for: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          attempt_number?: number
          attempted_at?: string | null
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          installment_id?: string
          outcome?: string
          scheduled_for?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_dues_retry_attempts_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "org_dues_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      org_dues_schedules: {
        Row: {
          active: boolean
          amount_cents: number
          created_at: string
          created_by: string | null
          ends_on: string | null
          frequency: string
          id: string
          org_id: string
          starts_on: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          frequency: string
          id?: string
          org_id: string
          starts_on: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          frequency?: string
          id?: string
          org_id?: string
          starts_on?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_dues_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_dues_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_dues_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_dues_schedules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_enrollment_forms: {
        Row: {
          age_group: string | null
          bundle_config: Json
          created_at: string | null
          description: string | null
          early_bird_deadline: string | null
          early_bird_fee_cents: number | null
          id: string
          is_active: boolean | null
          late_fee_cents: number | null
          late_fee_starts_at: string | null
          org_id: string
          required_waiver_ids: string[]
          season_id: string | null
          slug: string
          sport: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          age_group?: string | null
          bundle_config?: Json
          created_at?: string | null
          description?: string | null
          early_bird_deadline?: string | null
          early_bird_fee_cents?: number | null
          id?: string
          is_active?: boolean | null
          late_fee_cents?: number | null
          late_fee_starts_at?: string | null
          org_id: string
          required_waiver_ids?: string[]
          season_id?: string | null
          slug: string
          sport?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          age_group?: string | null
          bundle_config?: Json
          created_at?: string | null
          description?: string | null
          early_bird_deadline?: string | null
          early_bird_fee_cents?: number | null
          id?: string
          is_active?: boolean | null
          late_fee_cents?: number | null
          late_fee_starts_at?: string | null
          org_id?: string
          required_waiver_ids?: string[]
          season_id?: string | null
          slug?: string
          sport?: string | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_enrollment_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_enrollment_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollment_forms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_enrollment_submissions: {
        Row: {
          amount_paid_cents: number | null
          athlete_email: string
          athlete_name: string
          coppa_consent_date: string | null
          coppa_consent_given: boolean
          coppa_consenting_guardian_email: string | null
          coppa_consenting_guardian_name: string | null
          created_at: string | null
          date_of_birth: string | null
          family_account_id: string | null
          form_id: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          net_cents: number | null
          notes: string | null
          org_id: string
          payment_method_brand: string | null
          payment_method_last4: string | null
          platform_fee_cents: number | null
          player_id: string | null
          pricing_phase: string | null
          registration_source: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signed_waiver_ids: string[]
          status: string
          stripe_processing_fee_cents: number | null
        }
        Insert: {
          amount_paid_cents?: number | null
          athlete_email: string
          athlete_name: string
          coppa_consent_date?: string | null
          coppa_consent_given?: boolean
          coppa_consenting_guardian_email?: string | null
          coppa_consenting_guardian_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          family_account_id?: string | null
          form_id: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          net_cents?: number | null
          notes?: string | null
          org_id: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          platform_fee_cents?: number | null
          player_id?: string | null
          pricing_phase?: string | null
          registration_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_waiver_ids?: string[]
          status?: string
          stripe_processing_fee_cents?: number | null
        }
        Update: {
          amount_paid_cents?: number | null
          athlete_email?: string
          athlete_name?: string
          coppa_consent_date?: string | null
          coppa_consent_given?: boolean
          coppa_consenting_guardian_email?: string | null
          coppa_consenting_guardian_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          family_account_id?: string | null
          form_id?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          net_cents?: number | null
          notes?: string | null
          org_id?: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          platform_fee_cents?: number | null
          player_id?: string | null
          pricing_phase?: string | null
          registration_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signed_waiver_ids?: string[]
          status?: string
          stripe_processing_fee_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_enrollment_submissions_family_account_id_fkey"
            columns: ["family_account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollment_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "org_enrollment_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollment_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_enrollment_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollment_submissions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_enrollments: {
        Row: {
          athlete_id: string
          created_at: string
          enrolled_at: string
          id: string
          org_id: string
          season: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          org_id: string
          season?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          org_id?: string
          season?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_enrollments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_enrollments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_event_collections: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          event_type: string
          id: string
          location: string | null
          name: string
          org_id: string
          payment_deadline: string | null
          per_player_amount_cents: number | null
          slug: string
          split_player_count: number | null
          starts_at: string
          team_id: string | null
          total_cost_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          event_type: string
          id?: string
          location?: string | null
          name: string
          org_id: string
          payment_deadline?: string | null
          per_player_amount_cents?: number | null
          slug: string
          split_player_count?: number | null
          starts_at: string
          team_id?: string | null
          total_cost_cents: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          payment_deadline?: string | null
          per_player_amount_cents?: number | null
          slug?: string
          split_player_count?: number | null
          starts_at?: string
          team_id?: string | null
          total_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_event_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_event_collections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_event_collections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_event_collections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_event_obligations: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          event_id: string
          family_account_id: string | null
          id: string
          player_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_due_cents: number
          amount_paid_cents?: number
          created_at?: string
          event_id: string
          family_account_id?: string | null
          id?: string
          player_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          event_id?: string
          family_account_id?: string | null
          id?: string
          player_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_event_obligations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "org_event_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_event_obligations_family_account_id_fkey"
            columns: ["family_account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_event_obligations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_event_payment_allocations: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          obligation_id: string
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          obligation_id: string
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          obligation_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_event_payment_allocations_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "org_event_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_event_payment_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_fee_assignments: {
        Row: {
          amount: number
          amount_cents: number | null
          athlete_id: string
          autopay: boolean
          created_at: string
          days_past_due: number
          due_date: string | null
          fee_id: string
          id: string
          org_id: string | null
          paid_at: string | null
          paid_off_platform: boolean
          payment_intent_id: string | null
          payment_sequence_number: number | null
          receipt_url: string | null
          retry_count: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          amount_cents?: number | null
          athlete_id: string
          autopay?: boolean
          created_at?: string
          days_past_due?: number
          due_date?: string | null
          fee_id: string
          id?: string
          org_id?: string | null
          paid_at?: string | null
          paid_off_platform?: boolean
          payment_intent_id?: string | null
          payment_sequence_number?: number | null
          receipt_url?: string | null
          retry_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          amount_cents?: number | null
          athlete_id?: string
          autopay?: boolean
          created_at?: string
          days_past_due?: number
          due_date?: string | null
          fee_id?: string
          id?: string
          org_id?: string | null
          paid_at?: string | null
          paid_off_platform?: boolean
          payment_intent_id?: string | null
          payment_sequence_number?: number | null
          receipt_url?: string | null
          retry_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_fee_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_assignments_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "org_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_fee_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_fee_reminders: {
        Row: {
          assignment_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_error: string | null
          delivery_status: string
          fee_id: string
          id: string
          idempotency_key: string | null
          message: string | null
          reminder_type: string
          sent_at: string
          sent_to: string | null
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          fee_id: string
          id?: string
          idempotency_key?: string | null
          message?: string | null
          reminder_type?: string
          sent_at?: string
          sent_to?: string | null
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          fee_id?: string
          id?: string
          idempotency_key?: string | null
          message?: string | null
          reminder_type?: string
          sent_at?: string
          sent_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_fee_reminders_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "org_fee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_reminders_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "org_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fee_reminders_sent_to_fkey"
            columns: ["sent_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_fees: {
        Row: {
          amount: number
          amount_cents: number
          audience_type: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string | null
          org_id: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_cents: number
          audience_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string | null
          org_id: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_cents?: number
          audience_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string | null
          org_id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_fees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_fees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_fees_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_games: {
        Row: {
          created_at: string | null
          game_date: string | null
          game_time: string | null
          game_type: string
          home_away: string | null
          id: string
          location_id: string | null
          notes: string | null
          opponent_name: string | null
          org_id: string
          result: string | null
          score_them: number | null
          score_us: number | null
          season_id: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          game_date?: string | null
          game_time?: string | null
          game_type?: string
          home_away?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opponent_name?: string | null
          org_id: string
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          season_id?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          game_date?: string | null
          game_time?: string | null
          game_type?: string
          home_away?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opponent_name?: string | null
          org_id?: string
          result?: string | null
          score_them?: number | null
          score_us?: number | null
          season_id?: string | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_games_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "org_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_games_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_games_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_games_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          id: string
          invited_by: string | null
          invited_email: string
          invited_user_id: string | null
          org_id: string
          role: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email: string
          invited_user_id?: string | null
          org_id: string
          role: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string
          invited_user_id?: string | null
          org_id?: string
          role?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_locations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          name: string
          org_id: string
          state: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          org_id: string
          state?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          org_id?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          org_id: string
          shared: boolean
          tags: string[]
          team: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id: string
          shared?: boolean
          tags?: string[]
          team?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          shared?: boolean
          tags?: string[]
          team?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_notification_preferences: {
        Row: {
          marketplace_orders: boolean
          org_id: string
          payment_reminders: boolean
          roster_updates: boolean
          schedule_changes: boolean
          updated_at: string
        }
        Insert: {
          marketplace_orders?: boolean
          org_id: string
          payment_reminders?: boolean
          roster_updates?: boolean
          schedule_changes?: boolean
          updated_at?: string
        }
        Update: {
          marketplace_orders?: boolean
          org_id?: string
          payment_reminders?: boolean
          roster_updates?: boolean
          schedule_changes?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_onboarding: {
        Row: {
          completed_at: string | null
          completed_steps: string[]
          org_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[]
          org_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[]
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_onboarding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_onboarding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_collection_allocations: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          obligation_id: string
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          obligation_id: string
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          obligation_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payment_collection_allocations_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "org_payment_collection_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_collection_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_collection_obligations: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          collection_id: string
          created_at: string
          family_account_id: string | null
          id: string
          player_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_due_cents: number
          amount_paid_cents?: number
          collection_id: string
          created_at?: string
          family_account_id?: string | null
          id?: string
          player_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          collection_id?: string
          created_at?: string
          family_account_id?: string | null
          id?: string
          player_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payment_collection_obligations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "org_payment_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_collection_obligations_family_account_id_fkey"
            columns: ["family_account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_collection_obligations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_collections: {
        Row: {
          active: boolean
          amount_cents: number
          collection_type: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          org_id: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          collection_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          collection_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payment_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_collections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_payment_collections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payment_collections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payments: {
        Row: {
          amount: number
          amount_cents: number | null
          assignment_id: string | null
          created_at: string
          description: string | null
          dispute_notes: string | null
          dispute_reviewed_at: string | null
          dispute_reviewed_by: string | null
          id: string
          net_cents: number | null
          org_id: string | null
          payer_id: string | null
          platform_fee_cents: number | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_processing_fee_cents: number | null
        }
        Insert: {
          amount?: number
          amount_cents?: number | null
          assignment_id?: string | null
          created_at?: string
          description?: string | null
          dispute_notes?: string | null
          dispute_reviewed_at?: string | null
          dispute_reviewed_by?: string | null
          id?: string
          net_cents?: number | null
          org_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
        }
        Update: {
          amount?: number
          amount_cents?: number | null
          assignment_id?: string | null
          created_at?: string
          description?: string | null
          dispute_notes?: string | null
          dispute_reviewed_at?: string | null
          dispute_reviewed_by?: string | null
          id?: string
          net_cents?: number | null
          org_id?: string | null
          payer_id?: string | null
          platform_fee_cents?: number | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_payments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "org_fee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payments_dispute_reviewed_by_fkey"
            columns: ["dispute_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_program_targets: {
        Row: {
          athlete_id: string | null
          created_at: string
          created_by: string | null
          id: string
          program_id: string
          target_type: string
          team_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          program_id: string
          target_type: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          program_id?: string
          target_type?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_program_targets_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_program_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_program_targets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_program_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_report_alerts: {
        Row: {
          comparison: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          metric: string
          org_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          comparison: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric: string
          org_id: string
          threshold: number
          updated_at?: string
        }
        Update: {
          comparison?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          metric?: string
          org_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_report_alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_report_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_report_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_report_schedules: {
        Row: {
          cadence: string
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          enabled: boolean
          id: string
          is_active: boolean | null
          next_delivery_at: string | null
          org_id: string
          recipients: string[]
          saved_report_id: string | null
          season_id: string | null
          time_of_day: string | null
          updated_at: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          id?: string
          is_active?: boolean | null
          next_delivery_at?: string | null
          org_id: string
          recipients?: string[]
          saved_report_id?: string | null
          season_id?: string | null
          time_of_day?: string | null
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          id?: string
          is_active?: boolean | null
          next_delivery_at?: string | null
          org_id?: string
          recipients?: string[]
          saved_report_id?: string | null
          season_id?: string | null
          time_of_day?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_report_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_report_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_report_schedules_saved_report_id_fkey"
            columns: ["saved_report_id"]
            isOneToOne: false
            referencedRelation: "org_saved_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_report_schedules_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "org_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      org_role_permissions: {
        Row: {
          created_at: string
          id: string
          org_id: string
          permissions: Json
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          permissions?: Json
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          permissions?: Json
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_saved_reports: {
        Row: {
          created_at: string
          created_by: string
          filters: Json
          id: string
          name: string
          org_id: string
          report_type: string
          season_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          filters?: Json
          id?: string
          name: string
          org_id: string
          report_type: string
          season_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          filters?: Json
          id?: string
          name?: string
          org_id?: string
          report_type?: string
          season_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_saved_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_saved_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_saved_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_saved_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "org_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      org_seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_seasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_seasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          achievements: string[]
          affiliations: string[]
          age_groups: string[]
          billing_address: string | null
          billing_contact: string | null
          brand_accent_color: string | null
          brand_cover_url: string | null
          brand_logo_url: string | null
          brand_primary_color: string | null
          cancellation_window: string | null
          communication_limits: string | null
          competition_levels: string[]
          compliance_checklist: Json | null
          contract_staff_limit: number | null
          contract_team_limit: number | null
          created_at: string | null
          description: string | null
          director_display_name: string | null
          eligibility_tracking: string | null
          facilities: string[]
          fee_reminder_policy: string | null
          guardian_consent: string | null
          inquiry_url: string | null
          invoice_frequency: string | null
          location: string | null
          medical_clearance: string | null
          org_id: string
          org_name: string | null
          org_refund_policy: string | null
          org_type: string | null
          plan: string | null
          plan_status: string | null
          processing_fee_rate: number
          policy_notes: string | null
          portal_preferences: Json | null
          practice_locations: string[]
          pricing_summary: string | null
          primary_contact_email: string | null
          profile_image_url: string | null
          programs: string[]
          public_document_urls: string[]
          public_phone: string | null
          registration_deadline: string | null
          registration_status: string
          reschedule_window: string | null
          season_end: string | null
          season_start: string | null
          service_area: string | null
          social_links: string[]
          sports: string[]
          stripe_account_id: string | null
          support_phone: string | null
          tax_id: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          achievements?: string[]
          affiliations?: string[]
          age_groups?: string[]
          billing_address?: string | null
          billing_contact?: string | null
          brand_accent_color?: string | null
          brand_cover_url?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          cancellation_window?: string | null
          communication_limits?: string | null
          competition_levels?: string[]
          compliance_checklist?: Json | null
          contract_staff_limit?: number | null
          contract_team_limit?: number | null
          created_at?: string | null
          description?: string | null
          director_display_name?: string | null
          eligibility_tracking?: string | null
          facilities?: string[]
          fee_reminder_policy?: string | null
          guardian_consent?: string | null
          inquiry_url?: string | null
          invoice_frequency?: string | null
          location?: string | null
          medical_clearance?: string | null
          org_id: string
          org_name?: string | null
          org_refund_policy?: string | null
          org_type?: string | null
          plan?: string | null
          plan_status?: string | null
          processing_fee_rate?: number
          policy_notes?: string | null
          portal_preferences?: Json | null
          practice_locations?: string[]
          pricing_summary?: string | null
          primary_contact_email?: string | null
          profile_image_url?: string | null
          programs?: string[]
          public_document_urls?: string[]
          public_phone?: string | null
          registration_deadline?: string | null
          registration_status?: string
          reschedule_window?: string | null
          season_end?: string | null
          season_start?: string | null
          service_area?: string | null
          social_links?: string[]
          sports?: string[]
          stripe_account_id?: string | null
          support_phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          achievements?: string[]
          affiliations?: string[]
          age_groups?: string[]
          billing_address?: string | null
          billing_contact?: string | null
          brand_accent_color?: string | null
          brand_cover_url?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          cancellation_window?: string | null
          communication_limits?: string | null
          competition_levels?: string[]
          compliance_checklist?: Json | null
          contract_staff_limit?: number | null
          contract_team_limit?: number | null
          created_at?: string | null
          description?: string | null
          director_display_name?: string | null
          eligibility_tracking?: string | null
          facilities?: string[]
          fee_reminder_policy?: string | null
          guardian_consent?: string | null
          inquiry_url?: string | null
          invoice_frequency?: string | null
          location?: string | null
          medical_clearance?: string | null
          org_id?: string
          org_name?: string | null
          org_refund_policy?: string | null
          org_type?: string | null
          plan?: string | null
          plan_status?: string | null
          processing_fee_rate?: number
          policy_notes?: string | null
          portal_preferences?: Json | null
          practice_locations?: string[]
          pricing_summary?: string | null
          primary_contact_email?: string | null
          profile_image_url?: string | null
          programs?: string[]
          public_document_urls?: string[]
          public_phone?: string | null
          registration_deadline?: string | null
          registration_status?: string
          reschedule_window?: string | null
          season_end?: string | null
          season_start?: string | null
          service_area?: string | null
          social_links?: string[]
          sports?: string[]
          stripe_account_id?: string | null
          support_phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string | null
          plan: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string | null
          plan?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string | null
          plan?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_team_coaches: {
        Row: {
          coach_id: string | null
          created_at: string
          id: string
          role: string
          team_id: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          id?: string
          role?: string
          team_id?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          id?: string
          role?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_team_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      org_team_members: {
        Row: {
          athlete_id: string | null
          created_at: string | null
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string | null
          id?: string
          role: string
          team_id: string
          user_id: string
        }
        Update: {
          athlete_id?: string | null
          created_at?: string | null
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_team_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_teams: {
        Row: {
          age_group: string | null
          competition_level: string | null
          created_at: string | null
          id: string
          location_id: string | null
          name: string
          org_id: string
          registration_status: string
          roster_capacity: number | null
          season_id: string | null
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          competition_level?: string | null
          created_at?: string | null
          id?: string
          location_id?: string | null
          name: string
          org_id: string
          registration_status?: string
          roster_capacity?: number | null
          season_id?: string | null
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          competition_level?: string | null
          created_at?: string | null
          id?: string
          location_id?: string | null
          name?: string
          org_id?: string
          registration_status?: string
          roster_capacity?: number | null
          season_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_teams_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "org_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tryout_registrations: {
        Row: {
          athlete_profile_id: string
          id: string
          owner_user_id: string
          registered_at: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tryout_id: string
        }
        Insert: {
          athlete_profile_id: string
          id?: string
          owner_user_id: string
          registered_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tryout_id: string
        }
        Update: {
          athlete_profile_id?: string
          id?: string
          owner_user_id?: string
          registered_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tryout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tryout_registrations_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_tryout_registrations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_tryout_registrations_tryout_id_fkey"
            columns: ["tryout_id"]
            isOneToOne: false
            referencedRelation: "org_tryouts"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tryouts: {
        Row: {
          created_at: string
          id: string
          location: string | null
          max_participants: number | null
          notes: string | null
          org_id: string
          price: number | null
          sport: string | null
          status: string
          title: string
          tryout_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          max_participants?: number | null
          notes?: string | null
          org_id: string
          price?: number | null
          sport?: string | null
          status?: string
          title: string
          tryout_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          max_participants?: number | null
          notes?: string | null
          org_id?: string
          price?: number | null
          sport?: string | null
          status?: string
          title?: string
          tryout_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tryouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_tryouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_waivers: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          org_id: string
          required_roles: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          required_roles?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          required_roles?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_waivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_waivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          role: string
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          role: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          role?: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          age_groups_served: string[]
          city: string | null
          competitive_level: string | null
          created_at: string | null
          founded_year: number | null
          id: string
          is_test: boolean
          metadata: Json | null
          name: string | null
          org_size_coaches: number | null
          org_size_players: number | null
          org_type: string | null
          region: string | null
          sport_primary: string | null
          sports_additional: string[]
          state: string | null
          status: string
          stripe_account_id: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          age_groups_served?: string[]
          city?: string | null
          competitive_level?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string
          is_test?: boolean
          metadata?: Json | null
          name?: string | null
          org_size_coaches?: number | null
          org_size_players?: number | null
          org_type?: string | null
          region?: string | null
          sport_primary?: string | null
          sports_additional?: string[]
          state?: string | null
          status?: string
          stripe_account_id?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          age_groups_served?: string[]
          city?: string | null
          competitive_level?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string
          is_test?: boolean
          metadata?: Json | null
          name?: string | null
          org_size_coaches?: number | null
          org_size_players?: number | null
          org_type?: string | null
          region?: string | null
          sport_primary?: string | null
          sports_additional?: string[]
          state?: string | null
          status?: string
          stripe_account_id?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      paperwork_audit_events: {
        Row: {
          actor_user_id: string | null
          athlete_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          record_id: string
          record_type: string
        }
        Insert: {
          actor_user_id?: string | null
          athlete_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          record_id: string
          record_type: string
        }
        Update: {
          actor_user_id?: string | null
          athlete_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          record_id?: string
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "paperwork_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paperwork_audit_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          amount_cents: number | null
          created_at: string
          currency: string
          fee_assignment_id: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          org_id: string | null
          payee_id: string | null
          payer_id: string | null
          receipt_url: string | null
          refund_amount: number | null
          refund_amount_cents: number | null
          refunded_at: string | null
          seller_id: string | null
          seller_type: string | null
          session_payment_id: string | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          amount_cents?: number | null
          created_at?: string
          currency?: string
          fee_assignment_id?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          org_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refund_amount_cents?: number | null
          refunded_at?: string | null
          seller_id?: string | null
          seller_type?: string | null
          session_payment_id?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          amount_cents?: number | null
          created_at?: string
          currency?: string
          fee_assignment_id?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          org_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refund_amount_cents?: number | null
          refunded_at?: string | null
          seller_id?: string | null
          seller_type?: string | null
          session_payment_id?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_fee_assignment_id_fkey"
            columns: ["fee_assignment_id"]
            isOneToOne: false
            referencedRelation: "org_fee_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "payment_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_session_payment_id_fkey"
            columns: ["session_payment_id"]
            isOneToOne: false
            referencedRelation: "session_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refund_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          athlete_id: string | null
          audit_metadata: Json
          id: string
          payment_record_id: string
          payment_type: string
          reason: string
          refunded_amount_cents: number
          requested_amount_cents: number
          requested_at: string
          requester_id: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          stripe_refund_id: string | null
          stripe_refund_status: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          athlete_id?: string | null
          audit_metadata?: Json
          id?: string
          payment_record_id: string
          payment_type: string
          reason: string
          refunded_amount_cents?: number
          requested_amount_cents: number
          requested_at?: string
          requester_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          stripe_refund_id?: string | null
          stripe_refund_status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          athlete_id?: string | null
          audit_metadata?: Json
          id?: string
          payment_record_id?: string
          payment_type?: string
          reason?: string
          refunded_amount_cents?: number
          requested_amount_cents?: number
          requested_at?: string
          requester_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          stripe_refund_id?: string | null
          stripe_refund_status?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_refund_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refund_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refund_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refund_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminder_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_error: string | null
          delivery_status: string
          id: string
          idempotency_key: string
          org_id: string | null
          recipient_email: string
          reminder_type: string
          source_id: string
          source_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          id?: string
          idempotency_key: string
          org_id?: string | null
          recipient_email: string
          reminder_type: string
          source_id: string
          source_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          id?: string
          idempotency_key?: string
          org_id?: string | null
          recipient_email?: string
          reminder_type?: string
          source_id?: string
          source_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminder_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "payment_reminder_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminder_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          age_group: string | null
          amount_cents: number
          athlete_profile_id: string | null
          created_at: string
          currency: string
          description: string
          failure_code: string | null
          failure_message: string | null
          family_id: string | null
          gross_amount_cents: number
          id: string
          is_off_platform: boolean
          metadata: Json
          net_amount_cents: number
          net_cents: number
          occurred_at: string
          org_id: string | null
          payer_id: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          payment_sequence_number: number | null
          platform_fee_cents: number
          player_id: string | null
          processing_fee_rate: number
          recurring_schedule_id: string | null
          refund_reason: string | null
          refunded_amount_cents: number
          season_id: string | null
          source_record_id: string | null
          source_record_type: string | null
          sport: string | null
          status: string
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_processing_fee_cents: number | null
          team_id: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          amount_cents: number
          athlete_profile_id?: string | null
          created_at?: string
          currency?: string
          description: string
          failure_code?: string | null
          failure_message?: string | null
          family_id?: string | null
          gross_amount_cents: number
          id?: string
          is_off_platform?: boolean
          metadata?: Json
          net_amount_cents: number
          net_cents: number
          occurred_at?: string
          org_id?: string | null
          payer_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_sequence_number?: number | null
          platform_fee_cents?: number
          player_id?: string | null
          processing_fee_rate?: number
          recurring_schedule_id?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          season_id?: string | null
          source_record_id?: string | null
          source_record_type?: string | null
          sport?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
          team_id?: string | null
          transaction_type: string
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          amount_cents?: number
          athlete_profile_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          failure_code?: string | null
          failure_message?: string | null
          family_id?: string | null
          gross_amount_cents?: number
          id?: string
          is_off_platform?: boolean
          metadata?: Json
          net_amount_cents?: number
          net_cents?: number
          occurred_at?: string
          org_id?: string | null
          payer_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_sequence_number?: number | null
          platform_fee_cents?: number
          player_id?: string | null
          processing_fee_rate?: number
          recurring_schedule_id?: string | null
          refund_reason?: string | null
          refunded_amount_cents?: number
          season_id?: string | null
          source_record_id?: string | null
          source_record_type?: string | null
          sport?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_processing_fee_cents?: number | null
          team_id?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "payment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_ledger: {
        Row: {
          amount_cents: number
          coach_id: string | null
          created_at: string | null
          id: string
          payout_id: string | null
          type: string
        }
        Insert: {
          amount_cents: number
          coach_id?: string | null
          created_at?: string | null
          id?: string
          payout_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number
          coach_id?: string | null
          created_at?: string | null
          id?: string
          payout_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_ledger_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_schedules: {
        Row: {
          cadence: string | null
          coach_id: string | null
          created_at: string | null
          id: string
          next_run_date: string | null
        }
        Insert: {
          cadence?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          next_run_date?: string | null
        }
        Update: {
          cadence?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string
          next_run_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_schedules_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          coach_id: string | null
          created_at: string | null
          id: string
          scheduled_at: string | null
          status: string | null
          stripe_payout_id: string | null
          total_cents: number
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          id?: string
          scheduled_at?: string | null
          status?: string | null
          stripe_payout_id?: string | null
          total_cents?: number
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          id?: string
          scheduled_at?: string | null
          status?: string | null
          stripe_payout_id?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fee_rules: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          percentage: number
          tier: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          percentage: number
          tier: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          percentage?: number
          tier?: string
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          apple_environment: string | null
          apple_latest_transaction_id: string | null
          apple_original_transaction_id: string | null
          apple_product_id: string | null
          billable_coach_quantity: number
          billing_interval: string | null
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          included_coach_quantity: number
          organization_id: string | null
          owner_id: string
          owner_type: string
          plan_type: string | null
          processing_fee_rate: number
          purchase_channel: string | null
          renewal_amount_cents: number | null
          status: string
          stripe_coach_seat_item_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_item_id: string | null
          tier: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          apple_environment?: string | null
          apple_latest_transaction_id?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          billable_coach_quantity?: number
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          included_coach_quantity?: number
          organization_id?: string | null
          owner_id: string
          owner_type: string
          plan_type?: string | null
          processing_fee_rate?: number
          purchase_channel?: string | null
          renewal_amount_cents?: number | null
          status?: string
          stripe_coach_seat_item_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_item_id?: string | null
          tier?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          apple_environment?: string | null
          apple_latest_transaction_id?: string | null
          apple_original_transaction_id?: string | null
          apple_product_id?: string | null
          billable_coach_quantity?: number
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          included_coach_quantity?: number
          organization_id?: string | null
          owner_id?: string
          owner_type?: string
          plan_type?: string | null
          processing_fee_rate?: number
          purchase_channel?: string | null
          renewal_amount_cents?: number | null
          status?: string
          stripe_coach_seat_item_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_item_id?: string | null
          tier?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "platform_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      player_participations: {
        Row: {
          created_at: string
          fee_amount_cents: number
          fee_type: string | null
          id: string
          org_id: string
          payment_status: string
          player_id: string
          referral_source_id: string | null
          registration_date: string
          registration_source: string
          season: string | null
          status: string
          team_id: string
          transaction_id: string | null
          updated_at: string
          waivers_signed: Json
        }
        Insert: {
          created_at?: string
          fee_amount_cents?: number
          fee_type?: string | null
          id?: string
          org_id: string
          payment_status?: string
          player_id: string
          referral_source_id?: string | null
          registration_date?: string
          registration_source?: string
          season?: string | null
          status?: string
          team_id: string
          transaction_id?: string | null
          updated_at?: string
          waivers_signed?: Json
        }
        Update: {
          created_at?: string
          fee_amount_cents?: number
          fee_type?: string | null
          id?: string
          org_id?: string
          payment_status?: string
          player_id?: string
          referral_source_id?: string | null
          registration_date?: string
          registration_source?: string
          season?: string | null
          status?: string
          team_id?: string
          transaction_id?: string | null
          updated_at?: string
          waivers_signed?: Json
        }
        Relationships: [
          {
            foreignKeyName: "player_participations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "player_participations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_participations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_participations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_participations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string | null
          id: string
          number: number | null
          position: string | null
          profile_id: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          number?: number | null
          position?: string | null
          profile_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          number?: number | null
          position?: string | null
          profile_id?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_plan_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          plan_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_plan_attachments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "practice_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_plan_shares: {
        Row: {
          can_edit: boolean | null
          coach_id: string
          created_at: string | null
          id: string
          plan_id: string
        }
        Insert: {
          can_edit?: boolean | null
          coach_id: string
          created_at?: string | null
          id?: string
          plan_id: string
        }
        Update: {
          can_edit?: boolean | null
          coach_id?: string
          created_at?: string | null
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_plan_shares_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_plan_shares_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "practice_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_plans: {
        Row: {
          athlete_id: string | null
          coach_id: string
          created_at: string
          created_by: string | null
          description: string | null
          drills: Json | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          location: string | null
          org_id: string | null
          session_date: string | null
          shared_with_team: boolean | null
          start_time: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          athlete_id?: string | null
          coach_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drills?: Json | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          org_id?: string | null
          session_date?: string | null
          shared_with_team?: boolean | null
          start_time?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          athlete_id?: string | null
          coach_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drills?: Json | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          org_id?: string | null
          session_date?: string | null
          shared_with_team?: boolean | null
          start_time?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "practice_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_plans_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          coach_id: string | null
          created_at: string | null
          description: string | null
          discount_label: string | null
          duration: string | null
          format: string | null
          id: string
          includes: string[] | null
          inventory_count: number | null
          media_url: string | null
          next_available: string | null
          org_id: string | null
          price: number | null
          price_cents: number | null
          price_label: string | null
          refund_policy: string | null
          sale_price: number | null
          shipping_notes: string | null
          shipping_required: boolean | null
          status: string | null
          team_id: string | null
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_label?: string | null
          duration?: string | null
          format?: string | null
          id?: string
          includes?: string[] | null
          inventory_count?: number | null
          media_url?: string | null
          next_available?: string | null
          org_id?: string | null
          price?: number | null
          price_cents?: number | null
          price_label?: string | null
          refund_policy?: string | null
          sale_price?: number | null
          shipping_notes?: string | null
          shipping_required?: boolean | null
          status?: string | null
          team_id?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_label?: string | null
          duration?: string | null
          format?: string | null
          id?: string
          includes?: string[] | null
          inventory_count?: number | null
          media_url?: string | null
          next_available?: string | null
          org_id?: string | null
          price?: number | null
          price_cents?: number | null
          price_label?: string | null
          refund_policy?: string | null
          sale_price?: number | null
          shipping_notes?: string | null
          shipping_required?: boolean | null
          status?: string | null
          team_id?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_visibility: {
        Row: {
          athlete_id: string
          athlete_profile_id: string | null
          created_at: string
          id: string
          section: string
          sub_profile_id: string | null
          visibility: string
        }
        Insert: {
          athlete_id: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          section: string
          sub_profile_id?: string | null
          visibility?: string
        }
        Update: {
          athlete_id?: string
          athlete_profile_id?: string | null
          created_at?: string
          id?: string
          section?: string
          sub_profile_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_visibility_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visibility_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visibility_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          achievements: string[]
          age_groups: string[]
          athlete_birthdate: string | null
          athlete_communication_settings: Json
          athlete_grade_level: string | null
          athlete_location: string | null
          athlete_primary_sport: string | null
          athlete_privacy_settings: Json
          athlete_season: string | null
          athlete_sport: string | null
          availability_summary: string | null
          available_to_orgs: boolean | null
          avatar_url: string | null
          bank_last4: string | null
          bio: string | null
          brand_accent_color: string | null
          brand_cover_url: string | null
          brand_logo_url: string | null
          brand_primary_color: string | null
          calendar_feed_token: string | null
          cart: Json
          certifications: string | null
          coach_ai_suggestions: boolean | null
          coach_auto_reply: string | null
          coach_cancel_window: string | null
          coach_grades: string[] | null
          coach_messaging_hours: string | null
          coach_privacy_settings: Json | null
          coach_profile_settings: Json | null
          coach_refund_policy: string | null
          coach_reschedule_window: string | null
          coach_seasons: string[] | null
          coach_security_settings: Json | null
          coach_silence_outside_hours: boolean | null
          coaching_experience_years: number | null
          coaching_philosophy: string | null
          competition_levels: string[]
          created_at: string | null
          current_org_id: string | null
          email: string | null
          full_name: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          has_certifications: boolean | null
          has_id_document: boolean | null
          heard_from: string | null
          id: string
          inquiry_url: string | null
          integration_settings: Json | null
          is_test: boolean
          location: string | null
          marketplace_preferences: Json
          notification_prefs: Json | null
          payout_day: string | null
          payout_schedule: string | null
          plan_tier: string | null
          referral_source: string | null
          role: string | null
          shipping_address_line1: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_state: string | null
          shipping_zip: string | null
          specialties: string[]
          sport: string | null
          status: string
          stripe_account_id: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          updated_at: string | null
          username: string | null
          verification_reviewed_at: string | null
          verification_reviewed_by: string | null
          verification_status: string | null
          verification_submitted_at: string | null
          website_url: string | null
        }
        Insert: {
          achievements?: string[]
          age_groups?: string[]
          athlete_birthdate?: string | null
          athlete_communication_settings?: Json
          athlete_grade_level?: string | null
          athlete_location?: string | null
          athlete_primary_sport?: string | null
          athlete_privacy_settings?: Json
          athlete_season?: string | null
          athlete_sport?: string | null
          availability_summary?: string | null
          available_to_orgs?: boolean | null
          avatar_url?: string | null
          bank_last4?: string | null
          bio?: string | null
          brand_accent_color?: string | null
          brand_cover_url?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          calendar_feed_token?: string | null
          cart?: Json
          certifications?: string | null
          coach_ai_suggestions?: boolean | null
          coach_auto_reply?: string | null
          coach_cancel_window?: string | null
          coach_grades?: string[] | null
          coach_messaging_hours?: string | null
          coach_privacy_settings?: Json | null
          coach_profile_settings?: Json | null
          coach_refund_policy?: string | null
          coach_reschedule_window?: string | null
          coach_seasons?: string[] | null
          coach_security_settings?: Json | null
          coach_silence_outside_hours?: boolean | null
          coaching_experience_years?: number | null
          coaching_philosophy?: string | null
          competition_levels?: string[]
          created_at?: string | null
          current_org_id?: string | null
          email?: string | null
          full_name?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          has_certifications?: boolean | null
          has_id_document?: boolean | null
          heard_from?: string | null
          id: string
          inquiry_url?: string | null
          integration_settings?: Json | null
          is_test?: boolean
          location?: string | null
          marketplace_preferences?: Json
          notification_prefs?: Json | null
          payout_day?: string | null
          payout_schedule?: string | null
          plan_tier?: string | null
          referral_source?: string | null
          role?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          specialties?: string[]
          sport?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          username?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          verification_submitted_at?: string | null
          website_url?: string | null
        }
        Update: {
          achievements?: string[]
          age_groups?: string[]
          athlete_birthdate?: string | null
          athlete_communication_settings?: Json
          athlete_grade_level?: string | null
          athlete_location?: string | null
          athlete_primary_sport?: string | null
          athlete_privacy_settings?: Json
          athlete_season?: string | null
          athlete_sport?: string | null
          availability_summary?: string | null
          available_to_orgs?: boolean | null
          avatar_url?: string | null
          bank_last4?: string | null
          bio?: string | null
          brand_accent_color?: string | null
          brand_cover_url?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          calendar_feed_token?: string | null
          cart?: Json
          certifications?: string | null
          coach_ai_suggestions?: boolean | null
          coach_auto_reply?: string | null
          coach_cancel_window?: string | null
          coach_grades?: string[] | null
          coach_messaging_hours?: string | null
          coach_privacy_settings?: Json | null
          coach_profile_settings?: Json | null
          coach_refund_policy?: string | null
          coach_reschedule_window?: string | null
          coach_seasons?: string[] | null
          coach_security_settings?: Json | null
          coach_silence_outside_hours?: boolean | null
          coaching_experience_years?: number | null
          coaching_philosophy?: string | null
          competition_levels?: string[]
          created_at?: string | null
          current_org_id?: string | null
          email?: string | null
          full_name?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          has_certifications?: boolean | null
          has_id_document?: boolean | null
          heard_from?: string | null
          id?: string
          inquiry_url?: string | null
          integration_settings?: Json | null
          is_test?: boolean
          location?: string | null
          marketplace_preferences?: Json
          notification_prefs?: Json | null
          payout_day?: string | null
          payout_schedule?: string | null
          plan_tier?: string | null
          referral_source?: string | null
          role?: string | null
          shipping_address_line1?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          specialties?: string[]
          sport?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          username?: string | null
          verification_reviewed_at?: string | null
          verification_reviewed_by?: string | null
          verification_status?: string | null
          verification_submitted_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_org_id_fkey"
            columns: ["current_org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "profiles_current_org_id_fkey"
            columns: ["current_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      program_registrations: {
        Row: {
          athlete_profile_id: string
          created_at: string
          id: string
          owner_user_id: string
          program_id: string
          receipt_url: string | null
          registered_at: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          workspace_id: string | null
        }
        Insert: {
          athlete_profile_id: string
          created_at?: string
          id?: string
          owner_user_id: string
          program_id: string
          receipt_url?: string | null
          registered_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          athlete_profile_id?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          program_id?: string
          receipt_url?: string | null
          registered_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_registrations_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_registrations_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_registrations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_registrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          capacity: number | null
          coach_id: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          org_id: string
          payment_plan_enabled: boolean
          payment_plan_first_payment_cents: number | null
          payment_plan_frequency: string | null
          payment_plan_installments: number | null
          price: number | null
          start_date: string | null
          status: string | null
          type: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          capacity?: number | null
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          org_id: string
          payment_plan_enabled?: boolean
          payment_plan_first_payment_cents?: number | null
          payment_plan_frequency?: string | null
          payment_plan_installments?: number | null
          price?: number | null
          start_date?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          capacity?: number | null
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          payment_plan_enabled?: boolean
          payment_plan_first_payment_cents?: number | null
          payment_plan_frequency?: string | null
          payment_plan_installments?: number | null
          price?: number | null
          start_date?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "programs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_deliveries: {
        Row: {
          action_url: string | null
          apns_id: string | null
          apns_status: number | null
          attempt_count: number
          created_at: string
          delivered_at: string | null
          device_token_id: string | null
          device_token_suffix: string
          environment: string
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          next_attempt_at: string
          notification_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          apns_id?: string | null
          apns_status?: number | null
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          device_token_id?: string | null
          device_token_suffix: string
          environment?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          apns_id?: string | null
          apns_status?: number | null
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          device_token_id?: string | null
          device_token_suffix?: string
          environment?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_device_token_id_fkey"
            columns: ["device_token_id"]
            isOneToOne: false
            referencedRelation: "device_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referee_id: string | null
          referrer_id: string | null
          role: string | null
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referee_id?: string | null
          referrer_id?: string | null
          role?: string | null
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referee_id?: string | null
          referrer_id?: string | null
          role?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_splits: {
        Row: {
          amount_cents: number
          created_at: string | null
          id: string
          order_id: string | null
          recipient_id: string | null
          split_percent: number
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          id?: string
          order_id?: string | null
          recipient_id?: string | null
          split_percent: number
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          id?: string
          order_id?: string | null
          recipient_id?: string | null
          split_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_splits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          athlete_id: string | null
          body: string | null
          created_at: string | null
          id: string
          product_id: string | null
          rating: number | null
        }
        Insert: {
          athlete_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          rating?: number | null
        }
        Update: {
          athlete_id?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          product_id?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          reasons: Json | null
          score: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          reasons?: Json | null
          score: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          reasons?: Json | null
          score?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      session_attendance: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          marked_at: string
          marked_by: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_payments: {
        Row: {
          amount: number
          athlete_id: string
          coach_id: string
          created_at: string
          currency: string
          id: string
          net_amount: number
          org_id: string | null
          paid_at: string | null
          payment_method: string | null
          platform_fee: number
          seller_id: string | null
          seller_type: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          athlete_id: string
          coach_id: string
          created_at?: string
          currency?: string
          id?: string
          net_amount?: number
          org_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          platform_fee?: number
          seller_id?: string | null
          seller_type?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          athlete_id?: string
          coach_id?: string
          created_at?: string
          currency?: string
          id?: string
          net_amount?: number
          org_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          platform_fee?: number
          seller_id?: string | null
          seller_type?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_payments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "session_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          athlete_id: string | null
          athlete_profile_id: string | null
          attendance_status: string | null
          availability_block_id: string | null
          booking_notes: string | null
          booking_type: string | null
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          cancellation_reason: string | null
          coach_id: string | null
          created_at: string | null
          duration_minutes: number | null
          end_time: string
          external_calendar_id: string | null
          external_event_id: string | null
          external_provider: string | null
          id: string
          location: string | null
          location_id: string | null
          meeting_link: string | null
          meeting_mode: string | null
          meeting_provider: string | null
          notes: string | null
          org_id: string | null
          payment_assignment_id: string | null
          payment_intent_id: string | null
          practice_plan_id: string | null
          price: number | null
          price_cents: number | null
          rescheduled_at: string | null
          rescheduled_by: string | null
          rescheduled_from_start_time: string | null
          session_type: string | null
          start_time: string
          status: string | null
          sub_profile_id: string | null
          sync_status: string | null
          team_id: string | null
          title: string | null
          type: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          athlete_profile_id?: string | null
          attendance_status?: string | null
          availability_block_id?: string | null
          booking_notes?: string | null
          booking_type?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          end_time: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          external_provider?: string | null
          id?: string
          location?: string | null
          location_id?: string | null
          meeting_link?: string | null
          meeting_mode?: string | null
          meeting_provider?: string | null
          notes?: string | null
          org_id?: string | null
          payment_assignment_id?: string | null
          payment_intent_id?: string | null
          practice_plan_id?: string | null
          price?: number | null
          price_cents?: number | null
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          rescheduled_from_start_time?: string | null
          session_type?: string | null
          start_time: string
          status?: string | null
          sub_profile_id?: string | null
          sync_status?: string | null
          team_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          athlete_profile_id?: string | null
          attendance_status?: string | null
          availability_block_id?: string | null
          booking_notes?: string | null
          booking_type?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          end_time?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          external_provider?: string | null
          id?: string
          location?: string | null
          location_id?: string | null
          meeting_link?: string | null
          meeting_mode?: string | null
          meeting_provider?: string | null
          notes?: string | null
          org_id?: string | null
          payment_assignment_id?: string | null
          payment_intent_id?: string | null
          practice_plan_id?: string | null
          price?: number | null
          price_cents?: number | null
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          rescheduled_from_start_time?: string | null
          session_type?: string | null
          start_time?: string
          status?: string | null
          sub_profile_id?: string | null
          sync_status?: string | null
          team_id?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_athlete_profile_id_fkey"
            columns: ["athlete_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_availability_block_id_fkey"
            columns: ["availability_block_id"]
            isOneToOne: false
            referencedRelation: "availability_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "org_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_practice_plan_id_fkey"
            columns: ["practice_plan_id"]
            isOneToOne: false
            referencedRelation: "practice_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_rescheduled_by_fkey"
            columns: ["rescheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_sub_profile_id_fkey"
            columns: ["sub_profile_id"]
            isOneToOne: false
            referencedRelation: "athlete_sub_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_targets: {
        Row: {
          created_at: string | null
          hours: number
          id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          hours: number
          id?: string
          type: string
        }
        Update: {
          created_at?: string | null
          hours?: number
          id?: string
          type?: string
        }
        Relationships: []
      }
      sla_timers: {
        Row: {
          due_at: string
          entity_id: string
          id: string
          resolved_at: string | null
          started_at: string | null
          status: string | null
          type: string
        }
        Insert: {
          due_at: string
          entity_id: string
          id?: string
          resolved_at?: string | null
          started_at?: string | null
          status?: string | null
          type: string
        }
        Update: {
          due_at?: string
          entity_id?: string
          id?: string
          resolved_at?: string | null
          started_at?: string | null
          status?: string | null
          type?: string
        }
        Relationships: []
      }
      slack_event_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          channel_key: string
          created_at: string
          event_key: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          record_id: string | null
          record_type: string
          sent_at: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          channel_key: string
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          record_id?: string | null
          record_type: string
          sent_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          channel_key?: string
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          record_id?: string | null
          record_type?: string
          sent_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_connect_accounts: {
        Row: {
          account_type: string
          charges_enabled: boolean
          coach_id: string | null
          connect_status: string
          created_at: string
          details_submitted: boolean
          disabled_reason: string | null
          id: string
          last_onboarding_url_created_at: string | null
          org_id: string | null
          owner_id: string | null
          owner_type: string
          payouts_enabled: boolean
          requirements_due: string[]
          stripe_account_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          account_type?: string
          charges_enabled?: boolean
          coach_id?: string | null
          connect_status?: string
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          last_onboarding_url_created_at?: string | null
          org_id?: string | null
          owner_id?: string | null
          owner_type: string
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          account_type?: string
          charges_enabled?: boolean
          coach_id?: string | null
          connect_status?: string
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          last_onboarding_url_created_at?: string | null
          org_id?: string | null
          owner_id?: string | null
          owner_type?: string
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_connect_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "stripe_connect_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_connect_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_connect_payment_accounting: {
        Row: {
          checkout_type: string
          connected_account_destination: string
          created_at: string
          currency: string
          gross_amount_cents: number
          id: string
          livemode: boolean
          net_amount_cents: number
          payment_record_id: string | null
          platform_fee_cents: number
          platform_fee_rate: number
          stripe_checkout_session_id: string | null
          stripe_metadata: Json
          stripe_payment_intent_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          checkout_type: string
          connected_account_destination: string
          created_at?: string
          currency?: string
          gross_amount_cents: number
          id?: string
          livemode?: boolean
          net_amount_cents: number
          payment_record_id?: string | null
          platform_fee_cents: number
          platform_fee_rate: number
          stripe_checkout_session_id?: string | null
          stripe_metadata?: Json
          stripe_payment_intent_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          checkout_type?: string
          connected_account_destination?: string
          created_at?: string
          currency?: string
          gross_amount_cents?: number
          id?: string
          livemode?: boolean
          net_amount_cents?: number
          payment_record_id?: string | null
          platform_fee_cents?: number
          platform_fee_rate?: number
          stripe_checkout_session_id?: string | null
          stripe_metadata?: Json
          stripe_payment_intent_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_payment_accounting_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          id: number
          last_error: string | null
          processed_at: string
          received_at: string | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          id?: number
          last_error?: string | null
          processed_at?: string
          received_at?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: number
          last_error?: string | null
          processed_at?: string
          received_at?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json | null
          body: string
          created_at: string | null
          customer_read_at: string | null
          id: string
          is_internal: boolean | null
          metadata: Json | null
          sender_id: string | null
          sender_name: string | null
          sender_role: string
          staff_read_at: string | null
          ticket_id: string | null
        }
        Insert: {
          attachments?: Json | null
          body: string
          created_at?: string | null
          customer_read_at?: string | null
          id?: string
          is_internal?: boolean | null
          metadata?: Json | null
          sender_id?: string | null
          sender_name?: string | null
          sender_role: string
          staff_read_at?: string | null
          ticket_id?: string | null
        }
        Update: {
          attachments?: Json | null
          body?: string
          created_at?: string | null
          customer_read_at?: string | null
          id?: string
          is_internal?: boolean | null
          metadata?: Json | null
          sender_id?: string | null
          sender_name?: string | null
          sender_role?: string
          staff_read_at?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_staff: boolean
          read_at: string | null
          sender_id: string
          source_message_id: string | null
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_staff?: boolean
          read_at?: string | null
          sender_id: string
          source_message_id?: string | null
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_staff?: boolean
          read_at?: string | null
          sender_id?: string
          source_message_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          category: string | null
          channel: string
          created_at: string | null
          description: string | null
          external_message_id: string | null
          external_thread_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          metadata: Json | null
          org_name: string | null
          priority: string
          requester_email: string | null
          requester_name: string | null
          requester_role: string | null
          requester_unread_count: number
          sla_due_at: string | null
          sla_minutes: number | null
          staff_unread_count: number
          status: string
          subject: string
          team_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          category?: string | null
          channel?: string
          created_at?: string | null
          description?: string | null
          external_message_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json | null
          org_name?: string | null
          priority?: string
          requester_email?: string | null
          requester_name?: string | null
          requester_role?: string | null
          requester_unread_count?: number
          sla_due_at?: string | null
          sla_minutes?: number | null
          staff_unread_count?: number
          status?: string
          subject: string
          team_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          category?: string | null
          channel?: string
          created_at?: string | null
          description?: string | null
          external_message_id?: string | null
          external_thread_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          metadata?: Json | null
          org_name?: string | null
          priority?: string
          requester_email?: string | null
          requester_name?: string | null
          requester_role?: string | null
          requester_unread_count?: number
          sla_due_at?: string | null
          sla_minutes?: number | null
          staff_unread_count?: number
          status?: string
          subject?: string
          team_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_records: {
        Row: {
          amount_cents: number | null
          created_at: string | null
          id: string
          jurisdiction: string | null
          order_id: string | null
          rate: number | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          order_id?: string | null
          rate?: number | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          order_id?: string | null
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      team_roster_history: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          player_id: string
          removed_at: string | null
          team_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          player_id: string
          removed_at?: string | null
          team_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          player_id?: string
          removed_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_roster_history_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          coach_id: string | null
          created_at: string | null
          id: string
          level: string | null
          name: string
          org_id: string | null
          sport: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          id?: string
          level?: string | null
          name: string
          org_id?: string | null
          sport?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          id?: string
          level?: string | null
          name?: string
          org_id?: string | null
          sport?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          archived_at: string | null
          blocked_at: string | null
          created_at: string
          id: string
          last_read_at: string | null
          muted_at: string | null
          pinned_at: string | null
          role: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          blocked_at?: string | null
          created_at?: string
          id?: string
          last_read_at?: string | null
          muted_at?: string | null
          pinned_at?: string | null
          role?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          blocked_at?: string | null
          created_at?: string
          id?: string
          last_read_at?: string | null
          muted_at?: string | null
          pinned_at?: string | null
          role?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_group: boolean | null
          org_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          org_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          org_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_criteria: {
        Row: {
          id: string
          label: string
          max_score: number | null
          sort_order: number | null
          tryout_event_id: string
          weight: number | null
        }
        Insert: {
          id?: string
          label: string
          max_score?: number | null
          sort_order?: number | null
          tryout_event_id: string
          weight?: number | null
        }
        Update: {
          id?: string
          label?: string
          max_score?: number | null
          sort_order?: number | null
          tryout_event_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_criteria_tryout_event_id_fkey"
            columns: ["tryout_event_id"]
            isOneToOne: false
            referencedRelation: "tryout_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_evaluations: {
        Row: {
          created_at: string | null
          criteria_id: string
          evaluator_id: string
          id: string
          notes: string | null
          registration_id: string
          score: number
          tryout_event_id: string
        }
        Insert: {
          created_at?: string | null
          criteria_id: string
          evaluator_id: string
          id?: string
          notes?: string | null
          registration_id: string
          score: number
          tryout_event_id: string
        }
        Update: {
          created_at?: string | null
          criteria_id?: string
          evaluator_id?: string
          id?: string
          notes?: string | null
          registration_id?: string
          score?: number
          tryout_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryout_evaluations_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "tryout_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_evaluations_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "tryout_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_evaluations_tryout_event_id_fkey"
            columns: ["tryout_event_id"]
            isOneToOne: false
            referencedRelation: "tryout_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_events: {
        Row: {
          age_group: string | null
          created_at: string | null
          event_date: string | null
          event_time: string | null
          id: string
          location_id: string | null
          max_slots: number | null
          name: string
          notes: string | null
          org_id: string
          registration_fee_cents: number | null
          season_id: string | null
          sport: string | null
          status: string | null
        }
        Insert: {
          age_group?: string | null
          created_at?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          location_id?: string | null
          max_slots?: number | null
          name: string
          notes?: string | null
          org_id: string
          registration_fee_cents?: number | null
          season_id?: string | null
          sport?: string | null
          status?: string | null
        }
        Update: {
          age_group?: string | null
          created_at?: string | null
          event_date?: string | null
          event_time?: string | null
          id?: string
          location_id?: string | null
          max_slots?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          registration_fee_cents?: number | null
          season_id?: string | null
          sport?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "org_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tryout_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_registrations: {
        Row: {
          amount_cents: number | null
          athlete_email: string | null
          athlete_id: string | null
          athlete_name: string | null
          charge_id: string | null
          created_at: string | null
          id: string
          jersey_number: string | null
          net_cents: number | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          payment_status: string | null
          platform_fee_cents: number | null
          stripe_processing_fee_cents: number | null
          tryout_event_id: string
        }
        Insert: {
          amount_cents?: number | null
          athlete_email?: string | null
          athlete_id?: string | null
          athlete_name?: string | null
          charge_id?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: string | null
          net_cents?: number | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: string | null
          platform_fee_cents?: number | null
          stripe_processing_fee_cents?: number | null
          tryout_event_id: string
        }
        Update: {
          amount_cents?: number | null
          athlete_email?: string | null
          athlete_id?: string | null
          athlete_name?: string | null
          charge_id?: string | null
          created_at?: string | null
          id?: string
          jersey_number?: string | null
          net_cents?: number | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: string | null
          platform_fee_cents?: number | null
          stripe_processing_fee_cents?: number | null
          tryout_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tryout_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_registrations_tryout_event_id_fkey"
            columns: ["tryout_event_id"]
            isOneToOne: false
            referencedRelation: "tryout_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_user_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_user_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_user_id_fkey"
            columns: ["blocked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json | null
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          completed_steps: string[]
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[]
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[]
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_signatures: {
        Row: {
          full_name: string
          id: string
          ip_address: string | null
          signed_at: string
          user_id: string
          waiver_id: string
        }
        Insert: {
          full_name: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          user_id: string
          waiver_id: string
        }
        Update: {
          full_name?: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          user_id?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "org_waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_cents: number | null
          balance_cents: number | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          available_cents?: number | null
          balance_cents?: number | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          available_cents?: number | null
          balance_cents?: number | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_athlete_relationships: {
        Row: {
          approved_by: string | null
          athlete_id: string
          created_at: string
          id: string
          relationship_type: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_by?: string | null
          athlete_id: string
          created_at?: string
          id?: string
          relationship_type: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_by?: string | null
          athlete_id?: string
          created_at?: string
          id?: string
          relationship_type?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_athlete_relationships_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_athlete_relationships_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_athlete_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_audit_events: {
        Row: {
          acting_role: string | null
          actor_user_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          record_id: string | null
          record_type: string | null
          workspace_id: string
        }
        Insert: {
          acting_role?: string | null
          actor_user_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          record_id?: string | null
          record_type?: string | null
          workspace_id: string
        }
        Update: {
          acting_role?: string | null
          actor_user_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          record_id?: string | null
          record_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          roles: string[]
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          roles?: string[]
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          roles?: string[]
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "business_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      coach_fee_assignment: {
        Row: {
          amount: number | null
          athlete_id: string | null
          coach_id: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          name: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          athlete_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_fee_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_fee_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_insights: {
        Row: {
          age_group: string | null
          avg_event_fee_cents: number | null
          avg_monthly_dues_cents: number | null
          avg_org_size_coaches: number | null
          avg_org_size_players: number | null
          avg_registration_fee_cents: number | null
          competitive_level: string | null
          payment_method_distribution: Json | null
          region: string | null
          sport: string | null
          state: string | null
        }
        Relationships: []
      }
      org_health_metrics: {
        Row: {
          avg_monthly_payment_volume_cents: number | null
          avg_registration_fee_cents: number | null
          months_on_platform: number | null
          org_id: string | null
          payment_collection_rate: number | null
          total_active_coaches: number | null
          total_active_players: number | null
          total_lifetime_payment_volume_cents: number | null
          total_teams: number | null
        }
        Insert: {
          avg_monthly_payment_volume_cents?: never
          avg_registration_fee_cents?: never
          months_on_platform?: never
          org_id?: string | null
          payment_collection_rate?: never
          total_active_coaches?: never
          total_active_players?: never
          total_lifetime_payment_volume_cents?: never
          total_teams?: never
        }
        Update: {
          avg_monthly_payment_volume_cents?: never
          avg_registration_fee_cents?: never
          months_on_platform?: never
          org_id?: string | null
          payment_collection_rate?: never
          total_active_coaches?: never
          total_active_players?: never
          total_lifetime_payment_volume_cents?: never
          total_teams?: never
        }
        Relationships: []
      }
      org_membership: {
        Row: {
          org_id: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          org_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          org_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "organization_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_summary: {
        Row: {
          avg_transaction_amount_cents: number | null
          month: string | null
          org_id: string | null
          payment_type_breakdown_cents: Json | null
          total_payment_volume_cents: number | null
          total_platform_fees_cents: number | null
          transaction_count: number | null
          unique_payers: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "payment_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_operations_health: {
        Row: {
          issue_id: string | null
          issue_type: string | null
          last_error: string | null
          payment_type: string | null
          resource_id: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      player_participation_history: {
        Row: {
          age_group: string | null
          org_id: string | null
          player_id: string | null
          registration_date: string | null
          season: string | null
          seasons_with_org: number | null
          sport: string | null
          status: string | null
          team_id: string | null
          total_orgs: number | null
          total_paid_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_participations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org_health_metrics"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "player_participations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_participations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "athlete_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_participations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "org_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_admin_reconciliation_queue: {
        Row: {
          created_at: string | null
          id: string | null
          table_name: string | null
        }
        Relationships: []
      }
      workspace_reconciliation_queue: {
        Row: {
          created_at: string | null
          id: string | null
          table_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_athlete_guardian_invitation: {
        Args: { p_invite_id: string }
        Returns: string
      }
      accept_coach_invite: {
        Args: { athlete_profile_id?: string; invite_id: string }
        Returns: string
      }
      accept_org_invite: {
        Args: { athlete_profile_id?: string; invite_id: string }
        Returns: string
      }
      activate_independent_workspace: { Args: never; Returns: string }
      admin_archive_organization: {
        Args: { p_org_id: string; p_reason: string }
        Returns: undefined
      }
      admin_archive_user: {
        Args: { p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_cancel_marketplace_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: {
          amount: number
          buyer_id: string | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          coach_id: string | null
          created_at: string
          delivery_status: string | null
          fulfilled_at: string | null
          fulfillment_status: string
          id: string
          item_id: string | null
          org_id: string | null
          payment_status: string | null
          receipt_url: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number | null
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_decide_connect_verification: {
        Args: { p_account_id: string; p_decision: string }
        Returns: {
          account_id: string
          saved_status: string
        }[]
      }
      admin_delete_empty_test_organization: {
        Args: { p_confirmation: string; p_org_id: string; p_reason: string }
        Returns: undefined
      }
      admin_delete_test_user: {
        Args: { p_confirmation: string; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_governance_snapshot: { Args: never; Returns: Json }
      admin_insights_summary: { Args: never; Returns: Json }
      admin_list_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_test: boolean
          last_sign_in_at: string
          role: string
          status: string
        }[]
      }
      admin_organization_engagement: {
        Args: never
        Returns: {
          health_status: string
          last_activity_at: string
          member_count: number
          messages_30d: number
          organization_id: string
          payments_30d: number
          sessions_30d: number
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_program_monitoring: {
        Args: { p_include_test?: boolean }
        Returns: {
          audience_summary: string
          canceled_count: number
          capacity: number
          checkout_issue_count: number
          end_date: string
          gross_collected: number
          id: string
          location: string
          name: string
          org_id: string
          organization_is_test: boolean
          organization_name: string
          organization_net: number
          paid_count: number
          pending_count: number
          platform_fees: number
          price: number
          program_type: string
          refunded_count: number
          registration_count: number
          remaining_spaces: number
          start_date: string
          status: string
          webhook_issue_count: number
        }[]
      }
      admin_register_ops_issues: {
        Args: { p_issue_keys: string[] }
        Returns: {
          first_seen_at: string
          issue_key: string
        }[]
      }
      admin_resolve_refund_request: {
        Args: {
          new_status: string
          request_id: string
          resolution_note?: string
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          athlete_id: string | null
          audit_metadata: Json
          id: string
          payment_record_id: string
          payment_type: string
          reason: string
          refunded_amount_cents: number
          requested_amount_cents: number
          requested_at: string
          requester_id: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          stripe_refund_id: string | null
          stripe_refund_status: string | null
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_refund_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_retry_slack_events: {
        Args: { p_event_id?: string }
        Returns: number
      }
      admin_revenue_ledger: {
        Args: never
        Returns: {
          amount: number
          checkout_type: string
          created_at: string
          description: string
          id: string
          owner_name: string
          owner_type: string
          payment_record_id: string
          stripe_checkout_session_id: string
          stripe_payment_intent_id: string
        }[]
      }
      admin_revenue_summary: {
        Args: never
        Returns: {
          month_revenue: number
          total_revenue: number
          transaction_count: number
        }[]
      }
      admin_send_stripe_connect_reminder: {
        Args: { p_coach_id?: string; p_org_id?: string }
        Returns: number
      }
      admin_set_ops_issue_resolution: {
        Args: {
          p_category: string
          p_detail: string
          p_issue_key: string
          p_note?: string
          p_resolved: boolean
          p_title: string
        }
        Returns: undefined
      }
      admin_set_ops_issue_status: {
        Args: {
          p_category: string
          p_detail: string
          p_issue_key: string
          p_note?: string
          p_status: string
          p_title: string
        }
        Returns: undefined
      }
      admin_set_organization_test_status: {
        Args: { p_is_test: boolean; p_org_id: string; p_reason: string }
        Returns: undefined
      }
      admin_set_user_test_status: {
        Args: { p_is_test: boolean; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_system_failure_feed: {
        Args: never
        Returns: {
          error_detail: string
          event_id: string
          event_type: string
          occurred_at: string
          source: string
          status: string
          workspace_id: string
        }[]
      }
      admin_tryout_monitoring: {
        Args: { p_include_test?: boolean }
        Returns: {
          canceled_count: number
          capacity: number
          checkout_issue_count: number
          checkout_session_ids: string[]
          connect_ready: boolean
          gross_collected: number
          id: string
          location: string
          org_id: string
          organization_is_test: boolean
          organization_name: string
          organization_net: number
          paid_count: number
          payment_intent_ids: string[]
          pending_count: number
          platform_fees: number
          price: number
          refunded_count: number
          registration_count: number
          remaining_spaces: number
          status: string
          title: string
          tryout_date: string
          waitlisted_count: number
          webhook_issue_count: number
        }[]
      }
      admin_user_support_timeline: {
        Args: { p_user_id: string }
        Returns: {
          detail: string
          event_id: string
          event_type: string
          occurred_at: string
          record_id: string
          status: string
          title: string
        }[]
      }
      admin_user_workspace_context: {
        Args: { p_user_id: string }
        Returns: {
          acting_role: string
          display_name: string
          is_active: boolean
          organization_id: string
          permissions: Json
          roles: string[]
          workspace_id: string
          workspace_status: string
          workspace_type: string
        }[]
      }
      admin_workspace_reconciliation: {
        Args: never
        Returns: {
          created_at: string
          record_id: string
          record_table: string
        }[]
      }
      apply_league_access_invitation: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      archive_paperwork: {
        Args: { p_record_id: string; p_record_type: string }
        Returns: undefined
      }
      assigned_org_documents_for_athlete: {
        Args: { p_athlete_id: string }
        Returns: {
          document_type: string
          id: string
          is_required: boolean
          storage_path: string
          title: string
          url: string
        }[]
      }
      assigned_org_programs_for_athlete: {
        Args: { p_athlete_id: string }
        Returns: {
          capacity: number
          coach_id: string
          created_at: string
          description: string
          end_date: string
          id: string
          location: string
          name: string
          org_id: string
          price: number
          start_date: string
          status: string
          type: string
        }[]
      }
      athlete_assigned_waiver_ids: {
        Args: { p_uid: string }
        Returns: string[]
      }
      available_workspaces: {
        Args: never
        Returns: {
          display_name: string
          is_last_used: boolean
          league_id: string
          organization_id: string
          permissions: Json
          roles: string[]
          workspace_id: string
          workspace_type: string
        }[]
      }
      can_access_coach_waiver: {
        Args: { target_waiver_id: string; user_id?: string }
        Returns: boolean
      }
      can_assign_league_access: {
        Args: { p_league_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_manage_athlete_avatar: {
        Args: { p_athlete_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_manage_coach_waiver_assignment: {
        Args: { target_waiver_id: string; user_id?: string }
        Returns: boolean
      }
      can_manage_org_profile: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_view_org_team: {
        Args: { p_team_id: string; p_user_id?: string }
        Returns: boolean
      }
      cancel_athlete_booking: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      cancel_marketplace_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_unpaid_coach_session_fee: {
        Args: { p_fee_id: string }
        Returns: undefined
      }
      ch_create_policy: {
        Args: {
          check_expression?: string
          target_command: string
          target_policy: string
          target_table: unknown
          using_expression: string
        }
        Returns: undefined
      }
      ch_create_policy_if_table: {
        Args: {
          check_expression?: string
          target_command: string
          target_policy: string
          target_table_name: string
          using_expression: string
        }
        Returns: undefined
      }
      ch_policy_exists: {
        Args: { target_policy: string; target_table: unknown }
        Returns: boolean
      }
      claim_operation_tasks: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          max_attempts: number
          metadata: Json | null
          next_run_at: string
          owner: string
          priority: string
          status: string
          title: string
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "operation_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_push_notification_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          action_url: string
          attempt_count: number
          body: string
          delivery_id: string
          device_token_id: string
          environment: string
          notification_data: Json
          notification_id: string
          notification_type: string
          related_id: string
          title: string
          token: string
        }[]
      }
      claim_slack_events: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          available_at: string
          channel_key: string
          created_at: string
          event_key: string
          event_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          record_id: string | null
          record_type: string
          sent_at: string | null
          severity: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "slack_event_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_my_expired_payment_reservations: { Args: never; Returns: Json }
      coach_decline_pending_booking: {
        Args: { p_fee_id: string }
        Returns: undefined
      }
      coach_owned_waiver_ids: { Args: { p_uid: string }; Returns: string[] }
      coach_request_paid_booking_cancellation: {
        Args: { p_fee_id: string; p_reason: string }
        Returns: undefined
      }
      coach_set_booking_outcome: {
        Args: { p_fee_id: string; p_outcome: string }
        Returns: undefined
      }
      coach_slot_registration_counts: {
        Args: { p_coach_id: string; p_range_end: string; p_range_start: string }
        Returns: {
          availability_block_id: string
          booked_count: number
          requested_start_time: string
        }[]
      }
      coach_slot_registration_counts_batch: {
        Args: {
          p_coach_ids: string[]
          p_range_end: string
          p_range_start: string
        }
        Returns: {
          availability_block_id: string
          booked_count: number
          coach_id: string
          requested_start_time: string
        }[]
      }
      complete_fee_payment: {
        Args: {
          assignment_id: string
          paid_amount?: number
          stripe_checkout_session_id: string
          stripe_payment_intent_id?: string
        }
        Returns: string
      }
      complete_marketplace_order: {
        Args: {
          buyer_id: string
          item_id: string
          paid_amount?: number
          stripe_checkout_session_id: string
          stripe_payment_intent_id?: string
        }
        Returns: string
      }
      complete_membership_subscription: {
        Args: {
          paid_amount?: number
          period_end?: string
          stripe_checkout_session_id: string
          stripe_subscription_id?: string
          subscription_id: string
        }
        Returns: undefined
      }
      complete_org_document: {
        Args: {
          athlete_profile_id: string
          document_id: string
          signed_upload_url?: string
          signer_name?: string
        }
        Returns: string
      }
      complete_org_payment_collection_obligation: {
        Args: {
          p_amount_cents: number
          p_obligation_id: string
          p_transaction_id: string
        }
        Returns: {
          amount_due_cents: number
          amount_paid_cents: number
          collection_id: string
          created_at: string
          family_account_id: string | null
          id: string
          player_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "org_payment_collection_obligations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_program_registration: {
        Args: {
          paid_amount?: number
          registration_id: string
          stripe_checkout_session_id: string
          stripe_payment_intent_id?: string
        }
        Returns: undefined
      }
      complete_slack_event: { Args: { p_id: string }; Returns: undefined }
      complete_tryout_registration: {
        Args: {
          paid_amount?: number
          registration_id: string
          stripe_checkout_session_id: string
          stripe_payment_intent_id?: string
        }
        Returns: undefined
      }
      create_coach_athlete_invite: {
        Args: { p_invited_email: string }
        Returns: string
      }
      create_group_thread: {
        Args: {
          p_org_id?: string
          p_participant_ids: string[]
          p_title: string
        }
        Returns: string
      }
      create_league_access_invitation: {
        Args: {
          p_email: string
          p_league_id: string
          p_role: string
          p_scope_id: string
          p_scope_type: string
        }
        Returns: string
      }
      create_org_athlete_and_invite_guardian: {
        Args: {
          p_athlete_name: string
          p_grade_level?: string
          p_guardian_email: string
          p_guardian_role?: string
          p_org_id: string
          p_sport?: string
          p_team_id?: string
        }
        Returns: string
      }
      create_org_document_with_targets: {
        Args: {
          p_athlete_ids?: string[]
          p_document_id: string
          p_document_type: string
          p_external_url: string
          p_file_sha256: string
          p_is_required: boolean
          p_org_id: string
          p_storage_path: string
          p_target_type: string
          p_team_ids?: string[]
          p_title: string
        }
        Returns: string
      }
      create_org_user_invite: {
        Args: {
          p_invited_email: string
          p_org_id: string
          p_role: string
          p_team_id?: string
        }
        Returns: string
      }
      current_active_workspace_id: {
        Args: { p_user_id?: string }
        Returns: string
      }
      current_user_email: { Args: never; Returns: string }
      current_user_thread_ids: { Args: never; Returns: string[] }
      decline_athlete_guardian_invitation: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      decline_coach_invite: { Args: { invite_id: string }; Returns: undefined }
      decline_org_invite: { Args: { invite_id: string }; Returns: undefined }
      discover_public_coaches: {
        Args: never
        Returns: {
          bio: string
          coach_id: string
          full_name: string
          location: string
          sport: string
        }[]
      }
      discover_public_organizations: {
        Args: never
        Returns: {
          city: string
          description: string
          id: string
          name: string
          sport_primary: string
          sports_additional: string[]
          state: string
          zip_code: string
        }[]
      }
      enable_organization_owner_coaching: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      enqueue_slack_operational_event: {
        Args: {
          p_channel_key: string
          p_event_key: string
          p_event_type: string
          p_payload?: Json
          p_record_id: string
          p_record_type: string
          p_severity: string
        }
        Returns: string
      }
      enqueue_trusted_slack_event: {
        Args: {
          p_channel_key: string
          p_event_key: string
          p_event_type: string
          p_payload?: Json
          p_record_id: string
          p_record_type: string
          p_severity: string
        }
        Returns: string
      }
      enroll_program_payment_plan: {
        Args: { p_athlete_profile_id: string; p_program_id: string }
        Returns: string
      }
      fail_slack_event: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      find_or_create_direct_thread: {
        Args: { p_recipient_id: string }
        Returns: string
      }
      increment_support_unread: {
        Args: { p_audience: string; p_ticket_id: string }
        Returns: undefined
      }
      invite_athlete_login: {
        Args: { p_athlete_id: string; p_email: string }
        Returns: string
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id?: string }; Returns: boolean }
      is_athlete: { Args: never; Returns: boolean }
      is_coach: { Args: never; Returns: boolean }
      is_coach_of_athlete_profile: {
        Args: { target_athlete_profile_id: string; user_id?: string }
        Returns: boolean
      }
      is_coach_of_user: {
        Args: { target_athlete_user_id: string; user_id?: string }
        Returns: boolean
      }
      is_family_member: {
        Args: { target_family_id: string; target_user_id: string }
        Returns: boolean
      }
      is_league_admin: {
        Args: { p_league_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_league_member: {
        Args: { p_league_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_org_director: {
        Args: { target_org_id: string; user_id?: string }
        Returns: boolean
      }
      is_org_document_assigned: {
        Args: { target_athlete_id: string; target_document_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { target_org_id: string; user_id?: string }
        Returns: boolean
      }
      is_org_program_visible: {
        Args: { target_athlete_id: string; target_program_id: string }
        Returns: boolean
      }
      is_thread_participant: {
        Args: { target_thread_id: string; user_id?: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: boolean
      }
      mark_org_announcement_read: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      message_program_audiences: {
        Args: never
        Returns: {
          full_name: string
          program_id: string
          program_name: string
          user_id: string
        }[]
      }
      mobile_backend_capabilities: { Args: never; Returns: Json }
      my_accessible_athlete_profiles: {
        Args: never
        Returns: {
          achievements: string[]
          athletic_goals: string | null
          auth_user_id: string | null
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          city: string | null
          competition_level: string | null
          coppa_consent_date: string | null
          coppa_consent_given: boolean
          coppa_consenting_parent_id: string | null
          created_at: string
          display_order: number
          duplicate_identity_confirmed: boolean
          family_id: string | null
          full_name: string
          gender: string | null
          grade_level: string | null
          graduation_year: number | null
          highlight_urls: string[]
          id: string
          is_primary: boolean
          is_test: boolean
          location: string | null
          owner_user_id: string | null
          performance_stats: string[]
          position: string | null
          season: string | null
          slug: string | null
          sport: string | null
          state: string | null
          status: string
          updated_at: string
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "athlete_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_coach_team_contexts: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
          team_id: string
          team_name: string
          workspace_id: string
        }[]
      }
      my_league_contexts: {
        Args: never
        Returns: {
          general_location: string
          league_id: string
          name: string
          role: string
          sport: string
        }[]
      }
      notify_user: {
        Args: {
          notification_body: string
          notification_title: string
          notification_type: string
          target_related_id?: string
          target_user_id: string
        }
        Returns: string
      }
      org_document_assignment_status: {
        Args: { p_document_id: string }
        Returns: {
          athlete_id: string
          athlete_name: string
          completed_at: string
          signature_hash: string
          status: string
        }[]
      }
      org_entitlement_limits: {
        Args: { p_org_id: string }
        Returns: {
          plan_key: string
          staff_limit: number
          team_limit: number
        }[]
      }
      org_program_target_summary: {
        Args: { p_program_id: string }
        Returns: {
          athlete_ids: string[]
          target_type: string
          team_ids: string[]
        }[]
      }
      organization_mobile_capabilities: {
        Args: { p_org_id: string }
        Returns: Json
      }
      owns_athlete_profile: {
        Args: { target_athlete_profile_id: string; user_id?: string }
        Returns: boolean
      }
      paperwork_compliance_export: {
        Args: { p_record_id: string; p_record_type: string }
        Returns: {
          athlete_id: string
          athlete_name: string
          due_at: string
          is_overdue: boolean
          pdf_sha256: string
          signature_hash: string
          signed_at: string
          signer_name: string
          signer_relationship: string
          status: string
        }[]
      }
      record_paperwork_event: {
        Args: {
          p_athlete_id?: string
          p_event_type: string
          p_metadata?: Json
          p_record_id: string
          p_record_type: string
        }
        Returns: string
      }
      record_refund_request_state: {
        Args: {
          p_approved_by?: string
          p_audit_metadata?: Json
          p_refunded_amount_cents?: number
          p_request_id: string
          p_resolution_note?: string
          p_status: string
          p_stripe_refund_id?: string
          p_stripe_refund_status?: string
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          athlete_id: string | null
          audit_metadata: Json
          id: string
          payment_record_id: string
          payment_type: string
          reason: string
          refunded_amount_cents: number
          requested_amount_cents: number
          requested_at: string
          requester_id: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          stripe_refund_id: string | null
          stripe_refund_status: string | null
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_refund_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remind_org_compliance_item: {
        Args: { p_item_id: string }
        Returns: string
      }
      reply_to_support_ticket: {
        Args: { p_body: string; p_ticket_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          is_staff: boolean
          read_at: string | null
          sender_id: string
          source_message_id: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_ticket_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_league_access: {
        Args: {
          p_league_id: string
          p_role: string
          p_scope_id: string
          p_scope_type: string
        }
        Returns: string
      }
      request_paid_coach_session:
        | {
            Args: {
              p_amount: number
              p_athlete_id: string
              p_availability_block_id: string
              p_coach_id: string
              p_duration_minutes: number
              p_note?: string
              p_start_time: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount: number
              p_athlete_id: string
              p_coach_id: string
              p_duration_minutes: number
              p_note?: string
              p_start_time: string
            }
            Returns: string
          }
      request_payment_refund: {
        Args: {
          payment_record_id: string
          payment_type: string
          reason: string
          requested_amount: number
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          athlete_id: string | null
          audit_metadata: Json
          id: string
          payment_record_id: string
          payment_type: string
          reason: string
          refunded_amount_cents: number
          requested_amount_cents: number
          requested_at: string
          requester_id: string
          resolution_note: string | null
          resolved_at: string | null
          status: string
          stripe_refund_id: string | null
          stripe_refund_status: string | null
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payment_refund_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_workspace_athlete_access: {
        Args: {
          p_athlete_email: string
          p_athlete_id: string
          p_reason: string
          p_workspace_id: string
        }
        Returns: string
      }
      requeue_stale_push_deliveries: { Args: never; Returns: number }
      reschedule_athlete_booking: {
        Args: {
          p_availability_block_id: string
          p_session_id: string
          p_start_time: string
        }
        Returns: Json
      }
      respond_league_access_invitation: {
        Args: { p_accept: boolean; p_invite_id: string }
        Returns: undefined
      }
      review_coach_document_request: {
        Args: { p_decision: string; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      review_league_access_invitation: {
        Args: { p_approve: boolean; p_invite_id: string }
        Returns: undefined
      }
      review_workspace_athlete_access: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: undefined
      }
      revoke_league_access_invitation: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      send_org_announcement: {
        Args: {
          p_audience?: string
          p_body: string
          p_org_id: string
          p_team_ids?: string[]
          p_title: string
        }
        Returns: string
      }
      send_paperwork_reminders: {
        Args: { p_record_id: string; p_record_type: string }
        Returns: number
      }
      set_active_workspace: {
        Args: { p_acting_role: string; p_workspace_id: string }
        Returns: undefined
      }
      set_org_program_targets: {
        Args: {
          p_athlete_ids?: string[]
          p_org_id: string
          p_program_id: string
          p_target_type: string
          p_team_ids?: string[]
        }
        Returns: undefined
      }
      sign_coach_waiver: {
        Args: {
          assignment_id: string
          signed_upload_url?: string
          signer_name?: string
        }
        Returns: undefined
      }
      sign_coach_waiver_immutable: {
        Args: { assignment_id: string; signer_name: string }
        Returns: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          coach_id: string
          consent_version: string | null
          created_at: string
          electronic_consent_attested: boolean
          full_name: string | null
          id: string
          ip_address: string | null
          proof_generated_at: string | null
          sent_at: string
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_at: string | null
          signed_body_snapshot: string | null
          signed_by_user_id: string | null
          signed_coach_name_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          viewed_at: string | null
          waiver_id: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "coach_waiver_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_coach_waiver_with_authority: {
        Args: {
          p_assignment_id: string
          p_authority_attested: boolean
          p_client_app_version?: string
          p_client_platform?: string
          p_consent_attested: boolean
          p_consent_version?: string
          p_signer_name: string
          p_signer_relationship: string
        }
        Returns: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          coach_id: string
          consent_version: string | null
          created_at: string
          electronic_consent_attested: boolean
          full_name: string | null
          id: string
          ip_address: string | null
          proof_generated_at: string | null
          sent_at: string
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_at: string | null
          signed_body_snapshot: string | null
          signed_by_user_id: string | null
          signed_coach_name_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          viewed_at: string | null
          waiver_id: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "coach_waiver_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_org_document_immutable: {
        Args: {
          athlete_profile_id: string
          document_id: string
          signer_name: string
        }
        Returns: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          completed_at: string
          consent_version: string | null
          created_at: string
          document_id: string
          electronic_consent_attested: boolean
          id: string
          proof_generated_at: string | null
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_by_user_id: string | null
          signed_external_url_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_org_name_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "org_document_completions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sign_org_document_with_authority: {
        Args: {
          p_athlete_profile_id: string
          p_authority_attested: boolean
          p_client_app_version?: string
          p_client_platform?: string
          p_consent_attested: boolean
          p_consent_version?: string
          p_document_id: string
          p_signer_name: string
          p_signer_relationship: string
        }
        Returns: {
          athlete_id: string
          client_app_version: string | null
          client_platform: string | null
          completed_at: string
          consent_version: string | null
          created_at: string
          document_id: string
          electronic_consent_attested: boolean
          id: string
          proof_generated_at: string | null
          signature_audit: Json | null
          signature_hash: string | null
          signature_name: string | null
          signed_by_user_id: string | null
          signed_external_url_snapshot: string | null
          signed_file_sha256_snapshot: string | null
          signed_org_name_snapshot: string | null
          signed_pdf_sha256: string | null
          signed_pdf_storage_path: string | null
          signed_storage_path_snapshot: string | null
          signed_title_snapshot: string | null
          signer_authority_attested: boolean
          signer_relationship: string | null
          status: string
          updated_at: string
          upload_url: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "org_document_completions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stripe_connect_status_from_flags: {
        Args: {
          charges_enabled: boolean
          details_submitted: boolean
          disabled_reason?: string
          payouts_enabled: boolean
        }
        Returns: string
      }
      thread_has_user_block: {
        Args: { p_sender_id: string; p_thread_id: string }
        Returns: boolean
      }
      try_iso_date:
        | {
            Args: { value: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.try_iso_date(value => text), public.try_iso_date(value => date). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { value: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.try_iso_date(value => text), public.try_iso_date(value => date). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      update_org_member_access_atomic: {
        Args: {
          p_actor_id: string
          p_membership_id: string
          p_org_id: string
          p_remove?: boolean
          p_role?: string
        }
        Returns: Json
      }
      user_allows_push: {
        Args: { target_type: string; target_user_id: string }
        Returns: boolean
      }
      user_has_league_context: {
        Args: { p_league_id: string; p_user_id?: string }
        Returns: boolean
      }
      workspace_has_permission: {
        Args: {
          p_permission: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      workspace_has_role: {
        Args: { p_role: string; p_user_id?: string; p_workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
