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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          birth_date: string | null
          created_at: string
          cref: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role_requested: string | null
          status: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          cref?: string | null
          email: string
          full_name: string
          id?: string
          phone?: string | null
          role_requested?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          cref?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role_requested?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      active_workout_sessions: {
        Row: {
          controlled_by: string | null
          control_status: string | null
          started_at: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          controlled_by?: string | null
          control_status?: string | null
          started_at?: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          controlled_by?: string | null
          control_status?: string | null
          started_at?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      app_payments: {
        Row: {
          amount_cents: number
          asaas_payment_id: string | null
          billing_type: string | null
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_url: string | null
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          plan_id: string | null
          provider: string
          provider_payment_id: string | null
          raw: Json
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          asaas_payment_id?: string | null
          billing_type?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          asaas_payment_id?: string | null
          billing_type?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "app_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          interval: string
          limits: Json | null
          name: string
          price_cents: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id: string
          interval: string
          limits?: Json | null
          name: string
          price_cents: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          limits?: Json | null
          name?: string
          price_cents?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          coach_id: string
          created_at: string
          end_time: string
          id: string
          notes: string | null
          start_time: string
          student_id: string | null
          title: string
          type: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          start_time: string
          student_id?: string | null
          title: string
          type: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          start_time?: string
          student_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_customers: {
        Row: {
          asaas_customer_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          asaas_customer_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          asaas_customer_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          asaas_event_id: string | null
          event_type: string | null
          id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          asaas_event_id?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          asaas_event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          abdominal_skinfold: number | null
          age: number | null
          arm: number | null
          arm_circ: number | null
          arm_circ_left: number | null
          arm_circ_right: number | null
          assessment_date: string | null
          bf: number | null
          biceps_skinfold: number | null
          biceps_skinfold_left: number | null
          biceps_skinfold_right: number | null
          bmi: number | null
          bmr: number | null
          body_fat_percentage: number | null
          calf_circ: number | null
          calf_circ_left: number | null
          calf_circ_right: number | null
          calf_skinfold: number | null
          chest_circ: number | null
          created_at: string | null
          date: string | null
          fat_mass: number | null
          gender: string | null
          height: number | null
          hip_circ: number | null
          id: string
          lean_mass: number | null
          midaxillary_skinfold: number | null
          notes: string | null
          observations: string | null
          pdf_url: string | null
          pectoral_skinfold: number | null
          student_id: string | null
          subscapular_skinfold: number | null
          sum7: number | null
          suprailiac_skinfold: number | null
          tdee: number | null
          thigh_circ: number | null
          thigh_circ_left: number | null
          thigh_circ_right: number | null
          thigh_skinfold: number | null
          trainer_id: string | null
          triceps_skinfold: number | null
          triceps_skinfold_left: number | null
          triceps_skinfold_right: number | null
          updated_at: string | null
          user_id: string | null
          waist: number | null
          waist_circ: number | null
          weight: number | null
        }
        Insert: {
          abdominal_skinfold?: number | null
          age?: number | null
          arm?: number | null
          arm_circ?: number | null
          arm_circ_left?: number | null
          arm_circ_right?: number | null
          assessment_date?: string | null
          bf?: number | null
          biceps_skinfold?: number | null
          biceps_skinfold_left?: number | null
          biceps_skinfold_right?: number | null
          bmi?: number | null
          bmr?: number | null
          body_fat_percentage?: number | null
          calf_circ?: number | null
          calf_circ_left?: number | null
          calf_circ_right?: number | null
          calf_skinfold?: number | null
          chest_circ?: number | null
          created_at?: string | null
          date?: string | null
          fat_mass?: number | null
          gender?: string | null
          height?: number | null
          hip_circ?: number | null
          id?: string
          lean_mass?: number | null
          midaxillary_skinfold?: number | null
          notes?: string | null
          observations?: string | null
          pdf_url?: string | null
          pectoral_skinfold?: number | null
          student_id?: string | null
          subscapular_skinfold?: number | null
          sum7?: number | null
          suprailiac_skinfold?: number | null
          tdee?: number | null
          thigh_circ?: number | null
          thigh_circ_left?: number | null
          thigh_circ_right?: number | null
          thigh_skinfold?: number | null
          trainer_id?: string | null
          triceps_skinfold?: number | null
          triceps_skinfold_left?: number | null
          triceps_skinfold_right?: number | null
          updated_at?: string | null
          user_id?: string | null
          waist?: number | null
          waist_circ?: number | null
          weight?: number | null
        }
        Update: {
          abdominal_skinfold?: number | null
          age?: number | null
          arm?: number | null
          arm_circ?: number | null
          arm_circ_left?: number | null
          arm_circ_right?: number | null
          assessment_date?: string | null
          bf?: number | null
          biceps_skinfold?: number | null
          biceps_skinfold_left?: number | null
          biceps_skinfold_right?: number | null
          bmi?: number | null
          bmr?: number | null
          body_fat_percentage?: number | null
          calf_circ?: number | null
          calf_circ_left?: number | null
          calf_circ_right?: number | null
          calf_skinfold?: number | null
          chest_circ?: number | null
          created_at?: string | null
          date?: string | null
          fat_mass?: number | null
          gender?: string | null
          height?: number | null
          hip_circ?: number | null
          id?: string
          lean_mass?: number | null
          midaxillary_skinfold?: number | null
          notes?: string | null
          observations?: string | null
          pdf_url?: string | null
          pectoral_skinfold?: number | null
          student_id?: string | null
          subscapular_skinfold?: number | null
          sum7?: number | null
          suprailiac_skinfold?: number | null
          tdee?: number | null
          thigh_circ?: number | null
          thigh_circ_left?: number | null
          thigh_circ_right?: number | null
          thigh_skinfold?: number | null
          trainer_id?: string | null
          triceps_skinfold?: number | null
          triceps_skinfold_left?: number | null
          triceps_skinfold_right?: number | null
          updated_at?: string | null
          user_id?: string | null
          waist?: number | null
          waist_circ?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          metadata?: Json
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          metadata?: Json
        }
        Relationships: []
      }
      cardio_tracks: {
        Row: {
          activity_type: string
          avg_pace_min_km: number | null
          calories_estimated: number | null
          created_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          finished_at: string | null
          id: string
          max_speed_kmh: number | null
          notes: string | null
          perceived_effort: number | null
          route: Json | null
          started_at: string | null
          user_id: string
          workout_id: string | null
        }
        Insert: {
          activity_type?: string
          avg_pace_min_km?: number | null
          calories_estimated?: number | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          max_speed_kmh?: number | null
          notes?: string | null
          perceived_effort?: number | null
          route?: Json | null
          started_at?: string | null
          user_id: string
          workout_id?: string | null
        }
        Update: {
          activity_type?: string
          avg_pace_min_km?: number | null
          calories_estimated?: number | null
          created_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          finished_at?: string | null
          id?: string
          max_speed_kmh?: number | null
          notes?: string | null
          perceived_effort?: number | null
          route?: Json | null
          started_at?: string | null
          user_id?: string
          workout_id?: string | null
        }
        Relationships: []
      }
      client_error_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          message: string
          meta: Json
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          message: string
          meta?: Json
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          message?: string
          meta?: Json
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_inbox_states: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          kind: string
          snooze_until: string | null
          status: string
          student_user_id: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          kind: string
          snooze_until?: string | null
          status?: string
          student_user_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          kind?: string
          snooze_until?: string | null
          status?: string
          student_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_nutrition_logs: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          date: string
          fat: number
          protein: number
          updated_at: string
          user_id: string
          water_ml: number
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          date: string
          fat?: number
          protein?: number
          updated_at?: string
          user_id: string
          water_ml?: number
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          date?: string
          fat?: number
          protein?: number
          updated_at?: string
          user_id?: string
          water_ml?: number
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          last_seen_at: string | null
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          last_seen_at?: string | null
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          last_seen_at?: string | null
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_channels: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "direct_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          message: string
          meta: Json
          pathname: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          stack: string | null
          status: Database["public"]["Enums"]["error_report_status"]
          updated_at: string
          url: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          message: string
          meta?: Json
          pathname?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          stack?: string | null
          status?: Database["public"]["Enums"]["error_report_status"]
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          message?: string
          meta?: Json
          pathname?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          stack?: string | null
          status?: Database["public"]["Enums"]["error_report_status"]
          updated_at?: string
          url?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exercise_alias_jobs: {
        Row: {
          alias: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          normalized_alias: string
          processed_at: string | null
          resolved_canonical_id: string | null
          resolved_canonical_name: string | null
          resolved_confidence: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alias: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          normalized_alias: string
          processed_at?: string | null
          resolved_canonical_id?: string | null
          resolved_canonical_name?: string | null
          resolved_confidence?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          normalized_alias?: string
          processed_at?: string | null
          resolved_canonical_id?: string | null
          resolved_canonical_name?: string | null
          resolved_confidence?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_aliases: {
        Row: {
          alias: string
          canonical_id: string
          confidence: number
          created_at: string
          id: string
          needs_review: boolean
          normalized_alias: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alias: string
          canonical_id: string
          confidence?: number
          created_at?: string
          id?: string
          needs_review?: boolean
          normalized_alias: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          canonical_id?: string
          confidence?: number
          created_at?: string
          id?: string
          needs_review?: boolean
          normalized_alias?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_aliases_canonical_fk"
            columns: ["canonical_id", "user_id"]
            isOneToOne: false
            referencedRelation: "exercise_canonical"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      exercise_canonical: {
        Row: {
          created_at: string
          display_name: string
          id: string
          normalized_name: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          normalized_name: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          normalized_name?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      exercise_execution_submissions: {
        Row: {
          created_at: string
          exercise_id: string | null
          exercise_library_id: string | null
          exercise_name: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["exercise_execution_submission_status"]
          student_user_id: string
          teacher_feedback: string | null
          updated_at: string
          video_bucket_id: string
          video_object_path: string | null
          workout_id: string | null
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          exercise_library_id?: string | null
          exercise_name?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["exercise_execution_submission_status"]
          student_user_id: string
          teacher_feedback?: string | null
          updated_at?: string
          video_bucket_id?: string
          video_object_path?: string | null
          workout_id?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          exercise_library_id?: string | null
          exercise_name?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["exercise_execution_submission_status"]
          student_user_id?: string
          teacher_feedback?: string | null
          updated_at?: string
          video_bucket_id?: string
          video_object_path?: string | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_execution_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_execution_submissions_exercise_library_id_fkey"
            columns: ["exercise_library_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_execution_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          aliases: string[] | null
          created_at: string
          difficulty: string | null
          display_name_pt: string
          environments: string[]
          equipment: string[]
          id: string
          is_compound: boolean
          normalized_name: string
          primary_muscle: string | null
          secondary_muscles: string[]
          video_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          created_at?: string
          difficulty?: string | null
          display_name_pt: string
          environments?: string[]
          equipment?: string[]
          id?: string
          is_compound?: boolean
          normalized_name: string
          primary_muscle?: string | null
          secondary_muscles?: string[]
          video_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          created_at?: string
          difficulty?: string | null
          display_name_pt?: string
          environments?: string[]
          equipment?: string[]
          id?: string
          is_compound?: boolean
          normalized_name?: string
          primary_muscle?: string | null
          secondary_muscles?: string[]
          video_url?: string | null
        }
        Relationships: []
      }
      exercise_muscle_maps: {
        Row: {
          canonical_name: string | null
          confidence: number
          exercise_key: string
          mapping: Json
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_name?: string | null
          confidence?: number
          exercise_key: string
          mapping: Json
          source?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          canonical_name?: string | null
          confidence?: number
          exercise_key?: string
          mapping?: Json
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_videos: {
        Row: {
          approved_at: string | null
          channel_title: string | null
          created_at: string
          created_by: string | null
          exercise_library_id: string
          id: string
          is_primary: boolean
          language: string | null
          normalized_name: string
          provider: string
          provider_video_id: string
          status: string
          title: string | null
          url: string
        }
        Insert: {
          approved_at?: string | null
          channel_title?: string | null
          created_at?: string
          created_by?: string | null
          exercise_library_id: string
          id?: string
          is_primary?: boolean
          language?: string | null
          normalized_name: string
          provider?: string
          provider_video_id?: string
          status?: string
          title?: string | null
          url: string
        }
        Update: {
          approved_at?: string | null
          channel_title?: string | null
          created_at?: string
          created_by?: string | null
          exercise_library_id?: string
          id?: string
          is_primary?: boolean
          language?: string | null
          normalized_name?: string
          provider?: string
          provider_video_id?: string
          status?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_videos_exercise_library_id_fkey"
            columns: ["exercise_library_id"]
            isOneToOne: false
            referencedRelation: "exercise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          cadence: string | null
          id: string
          is_unilateral: boolean
          method: string | null
          muscle_group: string | null
          name: string
          notes: string | null
          order: number | null
          rest_time: number | null
          side_rest_time: number | null
          transition_time: number | null
          video_url: string | null
          workout_id: string | null
        }
        Insert: {
          cadence?: string | null
          id?: string
          is_unilateral?: boolean
          method?: string | null
          muscle_group?: string | null
          name: string
          notes?: string | null
          order?: number | null
          rest_time?: number | null
          side_rest_time?: number | null
          transition_time?: number | null
          video_url?: string | null
          workout_id?: string | null
        }
        Update: {
          cadence?: string | null
          id?: string
          is_unilateral?: boolean
          method?: string | null
          muscle_group?: string | null
          name?: string
          notes?: string | null
          order?: number | null
          rest_time?: number | null
          side_rest_time?: number | null
          transition_time?: number | null
          video_url?: string | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          metadata: Json | null
          owner: string | null
          review_at: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          metadata?: Json | null
          owner?: string | null
          review_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          metadata?: Json | null
          owner?: string | null
          review_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      gym_checkins: {
        Row: {
          checked_in_at: string | null
          gym_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          user_id: string
          workout_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          gym_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          user_id: string
          workout_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          gym_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_checkins_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "user_gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string | null
          from_uid: string | null
          id: string
          status: string | null
          team_session_id: string | null
          to_uid: string | null
          workout_data: Json | null
        }
        Insert: {
          created_at?: string | null
          from_uid?: string | null
          id?: string
          status?: string | null
          team_session_id?: string | null
          to_uid?: string | null
          workout_data?: Json | null
        }
        Update: {
          created_at?: string | null
          from_uid?: string | null
          id?: string
          status?: string | null
          team_session_id?: string | null
          to_uid?: string | null
          workout_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_from_uid_fkey"
            columns: ["from_uid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_to_uid_fkey"
            columns: ["to_uid"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_result_markers: {
        Row: {
          category: string
          created_at: string
          id: string
          lab_result_id: string
          marker_name: string
          ref_max: number | null
          ref_min: number | null
          status: string | null
          unit: string
          value: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          lab_result_id: string
          marker_name: string
          ref_max?: number | null
          ref_min?: number | null
          status?: string | null
          unit: string
          value: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          lab_result_id?: string
          marker_name?: string
          ref_max?: number | null
          ref_min?: number | null
          status?: string | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "lab_result_markers_lab_result_id_fkey"
            columns: ["lab_result_id"]
            isOneToOne: false
            referencedRelation: "lab_results"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          created_at: string
          doctor_name: string | null
          exam_date: string
          id: string
          lab_name: string | null
          observations: string | null
          pdf_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doctor_name?: string | null
          exam_date: string
          id?: string
          lab_name?: string | null
          observations?: string | null
          pdf_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doctor_name?: string | null
          exam_date?: string
          id?: string
          lab_name?: string | null
          observations?: string | null
          pdf_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_payments: {
        Row: {
          amount_cents: number
          asaas_payment_id: string | null
          billing_type: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_url: string | null
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          plan_id: string | null
          platform_fee_cents: number
          status: string
          student_user_id: string
          subscription_id: string | null
          teacher_user_id: string
        }
        Insert: {
          amount_cents: number
          asaas_payment_id?: string | null
          billing_type?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          platform_fee_cents?: number
          status?: string
          student_user_id: string
          subscription_id?: string | null
          teacher_user_id: string
        }
        Update: {
          amount_cents?: number
          asaas_payment_id?: string | null
          billing_type?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          platform_fee_cents?: number
          status?: string
          student_user_id?: string
          subscription_id?: string | null
          teacher_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "teacher_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "marketplace_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string
          id: string
          plan_id: string
          status: string
          student_user_id: string
          teacher_user_id: string
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          id?: string
          plan_id: string
          status?: string
          student_user_id: string
          teacher_user_id: string
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          status?: string
          student_user_id?: string
          teacher_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "teacher_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_webhook_events: {
        Row: {
          action: string | null
          created_at: string
          data_id: string
          event_type: string | null
          id: string
          payload: Json
          request_id: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          data_id: string
          event_type?: string | null
          id?: string
          payload?: Json
          request_id: string
        }
        Update: {
          action?: string | null
          created_at?: string
          data_id?: string
          event_type?: string | null
          id?: string
          payload?: Json
          request_id?: string
        }
        Relationships: []
      }
      muscle_weekly_summaries: {
        Row: {
          payload: Json
          updated_at: string
          user_id: string
          week_start_date: string
        }
        Insert: {
          payload: Json
          updated_at?: string
          user_id?: string
          week_start_date: string
        }
        Update: {
          payload?: Json
          updated_at?: string
          user_id?: string
          week_start_date?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json
          read: boolean | null
          recipient_id: string
          sender_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json
          read?: boolean | null
          recipient_id: string
          sender_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          read?: boolean | null
          recipient_id?: string
          sender_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_custom_foods: {
        Row: {
          aliases: string[]
          carbs_per100g: number
          created_at: string
          fat_per100g: number
          fiber_per100g: number
          id: string
          kcal_per100g: number
          label_image_url: string | null
          name: string
          protein_per100g: number
          serving_size_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          carbs_per100g?: number
          created_at?: string
          fat_per100g?: number
          fiber_per100g?: number
          id?: string
          kcal_per100g?: number
          label_image_url?: string | null
          name: string
          protein_per100g?: number
          serving_size_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[]
          carbs_per100g?: number
          created_at?: string
          fat_per100g?: number
          fiber_per100g?: number
          id?: string
          kcal_per100g?: number
          label_image_url?: string | null
          name?: string
          protein_per100g?: number
          serving_size_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_favorite_meals: {
        Row: {
          created_at: string
          id: string
          meal_text: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_text: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_text?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_goals: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          fat: number
          id: string
          protein: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          id?: string
          protein?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          fat?: number
          id?: string
          protein?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_learned_foods: {
        Row: {
          carbs_per_100g: number
          created_at: string | null
          display_name: string
          fat_per_100g: number
          food_key: string
          id: string
          kcal_per_100g: number
          protein_per_100g: number
          source: string | null
          updated_at: string | null
          use_count: number | null
          user_id: string
        }
        Insert: {
          carbs_per_100g: number
          created_at?: string | null
          display_name: string
          fat_per_100g: number
          food_key: string
          id?: string
          kcal_per_100g: number
          protein_per_100g: number
          source?: string | null
          updated_at?: string | null
          use_count?: number | null
          user_id: string
        }
        Update: {
          carbs_per_100g?: number
          created_at?: string | null
          display_name?: string
          fat_per_100g?: number
          food_key?: string
          id?: string
          kcal_per_100g?: number
          protein_per_100g?: number
          source?: string | null
          updated_at?: string | null
          use_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_meal_entries: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          date: string
          fat: number
          food_name: string
          id: string
          protein: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          date: string
          fat?: number
          food_name: string
          id?: string
          protein?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          date?: string
          fat?: number
          food_name?: string
          id?: string
          protein?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          created_at: string
          event: string
          id: number
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      password_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          last4: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          last4?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          last4?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string | null
          date: string | null
          id: string
          kind: string
          notes: string | null
          url: string
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          url: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          url?: string
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acquisition_source: Json | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          display_name: string | null
          email: string | null
          handle: string | null
          id: string
          is_approved: boolean | null
          last_seen: string | null
          photo_url: string | null
          referral_code: string | null
          role: string | null
        }
        Insert: {
          acquisition_source?: Json | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          display_name?: string | null
          email?: string | null
          handle?: string | null
          id: string
          is_approved?: boolean | null
          last_seen?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string | null
        }
        Update: {
          acquisition_source?: Json | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          display_name?: string | null
          email?: string | null
          handle?: string | null
          id?: string
          is_approved?: boolean | null
          last_seen?: string | null
          photo_url?: string | null
          referral_code?: string | null
          role?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
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
      sessions: {
        Row: {
          created_at: string | null
          id: string
          name: string
          tracks_config: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          tracks_config?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          tracks_config?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: {
          advanced_config: Json | null
          completed: boolean | null
          duration_seconds: number | null
          exercise_id: string | null
          id: string
          is_warmup: boolean
          reps: string | null
          rpe: number | null
          set_number: number | null
          set_type: string
          weight: number | null
        }
        Insert: {
          advanced_config?: Json | null
          completed?: boolean | null
          duration_seconds?: number | null
          exercise_id?: string | null
          id?: string
          is_warmup?: boolean
          reps?: string | null
          rpe?: number | null
          set_number?: number | null
          set_type?: string
          weight?: number | null
        }
        Update: {
          advanced_config?: Json | null
          completed?: boolean | null
          duration_seconds?: number | null
          exercise_id?: string | null
          id?: string
          is_warmup?: boolean
          reps?: string | null
          rpe?: number | null
          set_number?: number | null
          set_type?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      social_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          status: Database["public"]["Enums"]["social_follow_status"]
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          status?: Database["public"]["Enums"]["social_follow_status"]
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          status?: Database["public"]["Enums"]["social_follow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "social_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_stories: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          is_deleted: boolean
          media_path: string
          meta: Json
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_deleted?: boolean
          media_path: string
          meta?: Json
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_deleted?: boolean
          media_path?: string
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "social_stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_story_comments: {
        Row: {
          body: string
          created_at: string
          id: number
          story_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: number
          story_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: number
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_story_comments_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "social_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_story_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_story_likes: {
        Row: {
          created_at: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "social_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_story_views: {
        Row: {
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "social_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      soft_delete_bin: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string
          deleted_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          media_paths: string[]
          payload: Json
          purge_after: string
          purged_at: string | null
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          media_paths?: string[]
          payload?: Json
          purge_after?: string
          purged_at?: string | null
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          media_paths?: string[]
          payload?: Json
          purge_after?: string
          purged_at?: string | null
        }
        Relationships: []
      }
      student_charges: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_url: string | null
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          plan_id: string | null
          provider: string
          provider_payment_id: string | null
          raw: Json | null
          status: string
          student_user_id: string
          subscription_id: string | null
          teacher_user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          student_user_id: string
          subscription_id?: string | null
          teacher_user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          student_user_id?: string
          subscription_id?: string | null
          teacher_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "student_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_service_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          price_cents: number
          session_duration_minutes: number | null
          sessions_per_week: number | null
          teacher_user_id: string
          training_days: string[] | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          price_cents?: number
          session_duration_minutes?: number | null
          sessions_per_week?: number | null
          teacher_user_id: string
          training_days?: string[] | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          price_cents?: number
          session_duration_minutes?: number | null
          sessions_per_week?: number | null
          teacher_user_id?: string
          training_days?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      student_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_payment_at: string | null
          next_due_date: string | null
          plan_id: string
          provider: string
          provider_subscription_id: string | null
          started_at: string | null
          status: string
          student_user_id: string
          teacher_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_payment_at?: string | null
          next_due_date?: string | null
          plan_id: string
          provider?: string
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          student_user_id: string
          teacher_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_payment_at?: string | null
          next_due_date?: string | null
          plan_id?: string
          provider?: string
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          student_user_id?: string
          teacher_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "student_service_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string
          status: string | null
          teacher_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          status?: string | null
          teacher_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          status?: string | null
          teacher_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      teacher_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          interval: string
          name: string
          price_cents: number
          status: string
          teacher_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          name: string
          price_cents: number
          status?: string
          teacher_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          name?: string
          price_cents?: number
          status?: string
          teacher_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          is_active: boolean
          max_students: number
          name: string
          price_cents: number
          sort_order: number
          tier_key: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          max_students?: number
          name: string
          price_cents?: number
          sort_order?: number
          tier_key: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          max_students?: number
          name?: string
          price_cents?: number
          sort_order?: number
          tier_key?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          asaas_account_id: string | null
          asaas_account_status: string | null
          asaas_wallet_id: string | null
          birth_date: string | null
          created_at: string
          email: string
          id: string
          name: string
          payment_status: string
          phone: string | null
          plan_status: string
          plan_subscription_id: string | null
          plan_tier_key: string
          plan_valid_until: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          asaas_account_id?: string | null
          asaas_account_status?: string | null
          asaas_wallet_id?: string | null
          birth_date?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          payment_status?: string
          phone?: string | null
          plan_status?: string
          plan_subscription_id?: string | null
          plan_tier_key?: string
          plan_valid_until?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          asaas_account_id?: string | null
          asaas_account_status?: string | null
          asaas_wallet_id?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          payment_status?: string
          phone?: string | null
          plan_status?: string
          plan_subscription_id?: string | null
          plan_tier_key?: string
          plan_valid_until?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_plan_tier_key_fkey"
            columns: ["plan_tier_key"]
            isOneToOne: false
            referencedRelation: "teacher_tiers"
            referencedColumns: ["tier_key"]
          },
        ]
      }
      team_chat_messages: {
        Row: {
          content: string
          created_at: string
          display_name: string
          id: string
          photo_url: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      team_session_presence: {
        Row: {
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          session_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          session_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_session_presence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "team_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_sessions: {
        Row: {
          created_at: string | null
          host_uid: string | null
          id: string
          participants: Json | null
          status: string | null
          updated_at: string
          workout_state: Json | null
        }
        Insert: {
          created_at?: string | null
          host_uid?: string | null
          id?: string
          participants?: Json | null
          status?: string | null
          updated_at?: string
          workout_state?: Json | null
        }
        Update: {
          created_at?: string | null
          host_uid?: string | null
          id?: string
          participants?: Json | null
          status?: string | null
          updated_at?: string
          workout_state?: Json | null
        }
        Relationships: []
      }
      tracks: {
        Row: {
          bpm: number | null
          created_at: string | null
          duration: number | null
          filename: string
          id: string
          key: string | null
          metadata: Json | null
          original_name: string
          storage_path: string
          user_id: string | null
        }
        Insert: {
          bpm?: number | null
          created_at?: string | null
          duration?: number | null
          filename: string
          id?: string
          key?: string | null
          metadata?: Json | null
          original_name: string
          storage_path: string
          user_id?: string | null
        }
        Update: {
          bpm?: number | null
          created_at?: string | null
          duration?: number | null
          filename?: string
          id?: string
          key?: string | null
          metadata?: Json | null
          original_name?: string
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      update_notifications: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          release_date: string
          title: string
          version: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          release_date?: string
          title: string
          version: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          release_date?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      user_activity_events: {
        Row: {
          app_version: string | null
          client_ts: string | null
          created_at: string
          display_name: string | null
          event_name: string
          event_type: string | null
          id: string
          metadata: Json
          path: string | null
          role: string | null
          screen: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          client_ts?: string | null
          created_at?: string
          display_name?: string | null
          event_name: string
          event_type?: string | null
          id?: string
          metadata?: Json
          path?: string | null
          role?: string | null
          screen?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          client_ts?: string | null
          created_at?: string
          display_name?: string | null
          event_name?: string
          event_type?: string | null
          id?: string
          metadata?: Json
          path?: string | null
          role?: string | null
          screen?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          limits_override: Json
          metadata: Json
          plan_id: string | null
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          limits_override?: Json
          metadata?: Json
          plan_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          limits_override?: Json
          metadata?: Json
          plan_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "app_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gyms: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          latitude: number
          longitude: number
          name: string
          qr_token: string
          radius_meters: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          latitude: number
          longitude: number
          name: string
          qr_token?: string
          radius_meters?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          qr_token?: string
          radius_meters?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_location_settings: {
        Row: {
          auto_checkin: boolean | null
          gps_enabled: boolean | null
          share_gym_presence: boolean | null
          show_on_gym_leaderboard: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_checkin?: boolean | null
          gps_enabled?: boolean | null
          share_gym_presence?: boolean | null
          show_on_gym_leaderboard?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_checkin?: boolean | null
          gps_enabled?: boolean | null
          share_gym_presence?: boolean | null
          show_on_gym_leaderboard?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          badge_id: string
          badge_kind: string
          badge_label: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          badge_kind: string
          badge_label: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          badge_kind?: string
          badge_label?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          preferences: Json
          tour_completed_at: string | null
          tour_skipped_at: string | null
          tour_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferences?: Json
          tour_completed_at?: string | null
          tour_skipped_at?: string | null
          tour_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferences?: Json
          tour_completed_at?: string | null
          tour_skipped_at?: string | null
          tour_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_update_views: {
        Row: {
          created_at: string
          id: string
          prompted_at: string | null
          update_id: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          prompted_at?: string | null
          update_id: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          prompted_at?: string | null
          update_id?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_update_views_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "update_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      vip_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vip_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_chat_threads: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vip_periodization_exercise_state: {
        Row: {
          estimated_1rm: number | null
          id: string
          last_reps: number | null
          last_weight: number | null
          normalized_exercise_name: string
          program_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          estimated_1rm?: number | null
          id?: string
          last_reps?: number | null
          last_weight?: number | null
          normalized_exercise_name: string
          program_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          estimated_1rm?: number | null
          id?: string
          last_reps?: number | null
          last_weight?: number | null
          normalized_exercise_name?: string
          program_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_periodization_exercise_state_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "vip_periodization_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_periodization_programs: {
        Row: {
          config: Json
          created_at: string
          days_per_week: number
          equipment: string[]
          goal: string
          id: string
          limitations: string | null
          model: string
          questionnaire: Json
          split: string
          start_date: string | null
          status: string
          time_minutes: number
          updated_at: string
          user_id: string
          weeks: number
        }
        Insert: {
          config?: Json
          created_at?: string
          days_per_week: number
          equipment?: string[]
          goal?: string
          id?: string
          limitations?: string | null
          model: string
          questionnaire?: Json
          split: string
          start_date?: string | null
          status?: string
          time_minutes: number
          updated_at?: string
          user_id: string
          weeks: number
        }
        Update: {
          config?: Json
          created_at?: string
          days_per_week?: number
          equipment?: string[]
          goal?: string
          id?: string
          limitations?: string | null
          model?: string
          questionnaire?: Json
          split?: string
          start_date?: string | null
          status?: string
          time_minutes?: number
          updated_at?: string
          user_id?: string
          weeks?: number
        }
        Relationships: []
      }
      vip_periodization_workouts: {
        Row: {
          created_at: string
          day_number: number
          id: string
          is_deload: boolean
          is_test: boolean
          phase: string
          program_id: string
          scheduled_date: string | null
          user_id: string
          week_number: number
          workout_id: string
        }
        Insert: {
          created_at?: string
          day_number: number
          id?: string
          is_deload?: boolean
          is_test?: boolean
          phase: string
          program_id: string
          scheduled_date?: string | null
          user_id: string
          week_number: number
          workout_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          id?: string
          is_deload?: boolean
          is_test?: boolean
          phase?: string
          program_id?: string
          scheduled_date?: string | null
          user_id?: string
          week_number?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_periodization_workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "vip_periodization_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_periodization_workouts_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_profile: {
        Row: {
          constraints: string | null
          equipment: string | null
          goal: string | null
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          constraints?: string | null
          equipment?: string | null
          goal?: string | null
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          constraints?: string | null
          equipment?: string | null
          goal?: string | null
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vip_usage_daily: {
        Row: {
          day: string
          feature_key: string
          last_used_at: string | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          day?: string
          feature_key: string
          last_used_at?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          day?: string
          feature_key?: string
          last_used_at?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      vip_welcome_views: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_dead_letters: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json
          resolved_at: string | null
          source: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          source: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          source?: string
        }
        Relationships: []
      }
      workout_checkins: {
        Row: {
          active_session_user_id: string | null
          answers: Json
          created_at: string
          energy: number | null
          id: string
          kind: string
          mood: number | null
          notes: string | null
          planned_workout_id: string | null
          sleep_hours: number | null
          soreness: number | null
          updated_at: string
          user_id: string
          weight_kg: number | null
          workout_id: string | null
        }
        Insert: {
          active_session_user_id?: string | null
          answers?: Json
          created_at?: string
          energy?: number | null
          id?: string
          kind: string
          mood?: number | null
          notes?: string | null
          planned_workout_id?: string | null
          sleep_hours?: number | null
          soreness?: number | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
          workout_id?: string | null
        }
        Update: {
          active_session_user_id?: string | null
          answers?: Json
          created_at?: string
          energy?: number | null
          id?: string
          kind?: string
          mood?: number | null
          notes?: string | null
          planned_workout_id?: string | null
          sleep_hours?: number | null
          soreness?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_checkins_active_session_user_id_fkey"
            columns: ["active_session_user_id"]
            isOneToOne: false
            referencedRelation: "active_workout_sessions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workout_checkins_planned_workout_id_fkey"
            columns: ["planned_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_checkins_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_session_logs: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          finished_at: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          started_at: string
          total_reps: number | null
          total_sets: number | null
          total_volume: number | null
          user_id: string
          workout_id: string | null
          workout_title: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          finished_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          started_at: string
          total_reps?: number | null
          total_sets?: number | null
          total_volume?: number | null
          user_id: string
          workout_id?: string | null
          workout_title?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          finished_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          started_at?: string
          total_reps?: number | null
          total_sets?: number | null
          total_volume?: number | null
          user_id?: string
          workout_id?: string | null
          workout_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_logs_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_set_logs: {
        Row: {
          created_at: string | null
          exercise_id: string | null
          exercise_name: string
          id: string
          is_warmup: boolean | null
          method: string | null
          muscle_group: string | null
          reps: number | null
          rpe: number | null
          session_id: string
          set_number: number
          set_type: string | null
          volume: number | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name: string
          id?: string
          is_warmup?: boolean | null
          method?: string | null
          muscle_group?: string | null
          reps?: number | null
          rpe?: number | null
          session_id: string
          set_number?: number
          set_type?: string | null
          volume?: number | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          exercise_id?: string | null
          exercise_name?: string
          id?: string
          is_warmup?: boolean | null
          method?: string | null
          muscle_group?: string | null
          reps?: number | null
          rpe?: number | null
          session_id?: string
          set_number?: number
          set_type?: string | null
          volume?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_session_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sync_mappings: {
        Row: {
          created_at: string
          id: string
          source_workout_id: string
          subscription_id: string
          target_workout_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_workout_id: string
          subscription_id: string
          target_workout_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          source_workout_id?: string
          subscription_id?: string
          target_workout_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sync_mappings_source_workout_id_fkey"
            columns: ["source_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sync_mappings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workout_sync_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sync_mappings_target_workout_id_fkey"
            columns: ["target_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sync_subscriptions: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          is_active: boolean
          source_user_id: string | null
          student_id: string
          target_user_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean
          source_user_id?: string | null
          student_id: string
          target_user_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          is_active?: boolean
          source_user_id?: string | null
          student_id?: string
          target_user_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sync_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sync_subscriptions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          finish_idempotency_key: string | null
          id: string
          idempotency_key: string | null
          is_template: boolean | null
          name: string
          notes: string | null
          sort_order: number
          source_workout_id: string | null
          student_id: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          finish_idempotency_key?: string | null
          id?: string
          idempotency_key?: string | null
          is_template?: boolean | null
          name: string
          notes?: string | null
          sort_order?: number
          source_workout_id?: string | null
          student_id?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          finish_idempotency_key?: string | null
          id?: string
          idempotency_key?: string | null
          is_template?: boolean | null
          name?: string
          notes?: string | null
          sort_order?: number
          source_workout_id?: string | null
          student_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_source_workout_id_fkey"
            columns: ["source_workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          display_name: string | null
          handle: string | null
          id: string
          last_seen: string | null
          photo_url: string | null
          role: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_team_invite: { Args: { invite_id: string }; Returns: Json }
      admin_get_vip_stats: {
        Args: { period_end?: string; period_start?: string }
        Returns: Json
      }
      approve_access_request: {
        Args: {
          p_actor_email?: string
          p_actor_id?: string
          p_actor_role?: string
          p_request_id: string
        }
        Returns: Json
      }
      auth_role: { Args: never; Returns: string }
      auth_uid: { Args: never; Returns: string }
      can_dm_pair: {
        Args: { p_user1: string; p_user2: string }
        Returns: boolean
      }
      can_view_story: {
        Args: { author: string; viewer: string }
        Returns: boolean
      }
      can_view_team_session: {
        Args: { p_session_id: string; p_uid: string }
        Returns: boolean
      }
      cleanup_inactive_push_tokens: { Args: never; Returns: number }
      create_recovery_codes: {
        Args: { p_count?: number }
        Returns: {
          code: string
          last4: string
        }[]
      }
      dedupe_direct_channels: {
        Args: never
        Returns: {
          channels_deduped: number
          messages_moved: number
          pairs_affected: number
        }[]
      }
      delete_student_cascade: {
        Args: {
          p_actor_email?: string
          p_actor_id?: string
          p_actor_role?: string
          p_student_id: string
        }
        Returns: Json
      }
      delete_teacher_cascade: {
        Args: {
          p_actor_email: string
          p_actor_id: string
          p_actor_role: string
          p_teacher_id: string
        }
        Returns: Json
      }
      get_dashboard_bootstrap: { Args: { p_user_id: string }; Returns: Json }
      get_or_create_direct_channel: {
        Args: { user1: string; user2: string }
        Returns: string
      }
      get_user_conversations: {
        Args: { user_id: string }
        Returns: {
          channel_id: string
          is_online: boolean
          last_message: string
          last_message_at: string
          other_user_id: string
          other_user_name: string
          other_user_photo: string
          unread_count: number
        }[]
      }
      increment_counter: {
        Args: { column_name: string; row_id: string; table_name: string }
        Returns: undefined
      }
      iron_rank_leaderboard: {
        Args: { limit_count: number }
        Returns: {
          display_name: string
          photo_url: string
          role: string
          total_volume_kg: number
          user_id: string
        }[]
      }
      iron_rank_my_total_volume: { Args: never; Returns: number }
      iron_rank_total_volume_for_user: { Args: { p_user_id: string }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_teacher_of: { Args: { target_user_id: string }; Returns: boolean }
      join_team_session_by_code: { Args: { code: string }; Returns: Json }
      jsonb_participants_has_uid: {
        Args: { participants: Json; uid: string }
        Returns: boolean
      }
      leave_team_session: { Args: { p_session_id: string }; Returns: Json }
      nutrition_add_meal_entry: {
        Args: {
          p_calories?: number
          p_carbs?: number
          p_date: string
          p_fat?: number
          p_food_name: string
          p_protein?: number
        }
        Returns: {
          calories: number
          carbs: number
          date: string
          entry_id: string
          fat: number
          food_name: string
          protein: number
          totals_calories: number
          totals_carbs: number
          totals_fat: number
          totals_protein: number
          user_id: string
        }[]
      }
      nutrition_delete_meal_entry: {
        Args: { p_entry_id: string }
        Returns: {
          date: string
          deleted_entry_id: string
          totals_calories: number
          totals_carbs: number
          totals_fat: number
          totals_protein: number
          user_id: string
        }[]
      }
      save_workout_atomic: {
        Args: {
          p_created_by: string
          p_exercises: Json
          p_is_template: boolean
          p_name: string
          p_notes: string
          p_user_id: string
          p_workout_id: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      teacher_can_add_student: {
        Args: { p_teacher_user_id: string }
        Returns: boolean
      }
      teacher_student_count: {
        Args: { p_teacher_user_id: string }
        Returns: number
      }
      try_parse_jsonb:
        | { Args: { p_json: Json }; Returns: Json }
        | { Args: { p_text: string }; Returns: Json }
      try_parse_numeric: { Args: { p_text: string }; Returns: number }
      users_share_private_channel: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      verify_recovery_code: { Args: { p_code: string }; Returns: boolean }
      verify_recovery_code_admin: {
        Args: { p_code: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      error_report_status: "new" | "triaged" | "resolved" | "ignored"
      exercise_execution_submission_status: "pending" | "approved" | "rejected"
      social_follow_status: "pending" | "accepted"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      error_report_status: ["new", "triaged", "resolved", "ignored"],
      exercise_execution_submission_status: ["pending", "approved", "rejected"],
      social_follow_status: ["pending", "accepted"],
    },
  },
} as const
