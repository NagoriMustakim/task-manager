export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      notifications: {
        Row: { body: string | null; created_at: string; dedupe_key: string; id: string; kind: string; link: string | null; read_at: string | null; title: string; user_id: string };
        ComputedFields: never;
        Insert: { body?: string | null; dedupe_key: string; kind: string; link?: string | null; title: string };
        Update: { read_at?: string | null };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          cache_read_tokens: number | null;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          estimated_cost_usd: number | null;
          feature: string;
          id: string;
          input_tokens: number | null;
          model: string | null;
          output_tokens: number | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ai_cache: {
        Row: { created_at: string; expires_at: string; feature: string; key_hash: string; response: Json; user_id: string };
        ComputedFields: never;
        Insert: { created_at?: string; expires_at: string; feature: string; key_hash: string; response: Json; user_id?: string };
        Update: { created_at?: string; expires_at?: string; feature?: string; key_hash?: string; response?: Json; user_id?: string };
        Relationships: [];
      };
      admin_user_access: {
        Row: {
          admin_id: string;
          granted_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          admin_id: string;
          granted_at?: string;
          user_id: string;
        };
        Update: {
          admin_id?: string;
          granted_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_user_access_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_user_access_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          archived_at: string | null;
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          period: string | null;
          period_start: string | null;
          target_count: number | null;
          created_at: string;
          description: string | null;
          id: string;
          status: Database["public"]["Enums"]["goal_status"];
          target_date: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          period?: string | null;
          period_start?: string | null;
          target_count?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["goal_status"];
          target_date?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          period?: string | null;
          period_start?: string | null;
          target_count?: number | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["goal_status"];
          target_date?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_date: string | null;
          goal_id: string;
          id: string;
          sort_order: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          goal_id: string;
          id?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_date?: string | null;
          goal_id?: string;
          id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_user_id_fkey";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_audit_log: {
        Row: {
          changed_at: string;
          changed_by: string;
          changed_by_uid: string | null;
          id: string;
          new_role: Database["public"]["Enums"]["app_role"];
          old_role: Database["public"]["Enums"]["app_role"] | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          changed_by?: string;
          changed_by_uid?: string | null;
          id?: string;
          new_role: Database["public"]["Enums"]["app_role"];
          old_role?: Database["public"]["Enums"]["app_role"] | null;
          user_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          changed_by_uid?: string | null;
          id?: string;
          new_role?: Database["public"]["Enums"]["app_role"];
          old_role?: Database["public"]["Enums"]["app_role"] | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_audit_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          from_date: string | null;
          from_priority: Database["public"]["Enums"]["task_priority"] | null;
          from_status: Database["public"]["Enums"]["task_status"] | null;
          id: string;
          occurrence_id: string | null;
          task_id: string;
          to_date: string | null;
          to_priority: Database["public"]["Enums"]["task_priority"] | null;
          to_status: Database["public"]["Enums"]["task_status"] | null;
          user_id: string;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["task_event_type"];
          from_date?: string | null;
          from_priority?: Database["public"]["Enums"]["task_priority"] | null;
          from_status?: Database["public"]["Enums"]["task_status"] | null;
          id?: string;
          occurrence_id?: string | null;
          task_id: string;
          to_date?: string | null;
          to_priority?: Database["public"]["Enums"]["task_priority"] | null;
          to_status?: Database["public"]["Enums"]["task_status"] | null;
          user_id: string;
          reason?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["task_event_type"];
          from_date?: string | null;
          from_priority?: Database["public"]["Enums"]["task_priority"] | null;
          from_status?: Database["public"]["Enums"]["task_status"] | null;
          id?: string;
          occurrence_id?: string | null;
          task_id?: string;
          to_date?: string | null;
          to_priority?: Database["public"]["Enums"]["task_priority"] | null;
          to_status?: Database["public"]["Enums"]["task_status"] | null;
          user_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_events_occurrence_id_user_id_fkey";
            columns: ["occurrence_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "task_occurrences";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "task_events_task_id_user_id_fkey";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      task_occurrences: {
        Row: {
          carried_from_occurrence_id: string | null;
          completed_at: string | null;
          created_at: string;
          end_time: string | null;
          id: string;
          original_date: string;
          scheduled_date: string;
          sort_order: number;
          start_time: string | null;
          status: Database["public"]["Enums"]["task_status"];
          task_id: string;
          updated_at: string;
          user_id: string;
          moved_to_occurrence_id: string | null;
          moved_at: string | null;
          moved_reason: string | null;
          completed_on: string | null;
        };
        ComputedFields: never;
        Insert: {
          carried_from_occurrence_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          original_date: string;
          scheduled_date: string;
          sort_order?: number;
          start_time?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          task_id: string;
          updated_at?: string;
          user_id?: string;
          moved_to_occurrence_id?: string | null;
          moved_at?: string | null;
          moved_reason?: string | null;
          completed_on?: string | null;
        };
        Update: {
          carried_from_occurrence_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          original_date?: string;
          scheduled_date?: string;
          sort_order?: number;
          start_time?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          task_id?: string;
          updated_at?: string;
          user_id?: string;
          moved_to_occurrence_id?: string | null;
          moved_at?: string | null;
          moved_reason?: string | null;
          completed_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_occurrences_carried_from_occurrence_id_user_id_fkey";
            columns: ["carried_from_occurrence_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "task_occurrences";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "task_occurrences_task_id_user_id_fkey";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      tasks: {
        Row: {
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          deadline_date: string | null;
          estimated_minutes: number | null;
          goal_id: string | null;
          id: string;
          notes: string | null;
          priority: Database["public"]["Enums"]["task_priority"];
          recurrence_rule: string | null;
          recurrence_until: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          recurrence_start: string | null;
          recurrence_start_time: string | null;
          recurrence_end_time: string | null;
          recurrence_generated_through: string | null;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          deadline_date?: string | null;
          estimated_minutes?: number | null;
          goal_id?: string | null;
          id?: string;
          notes?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
          recurrence_start?: string | null;
          recurrence_start_time?: string | null;
          recurrence_end_time?: string | null;
          recurrence_generated_through?: string | null;
        };
        Update: {
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          deadline_date?: string | null;
          estimated_minutes?: number | null;
          goal_id?: string | null;
          id?: string;
          notes?: string | null;
          priority?: Database["public"]["Enums"]["task_priority"];
          recurrence_rule?: string | null;
          recurrence_until?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          recurrence_start?: string | null;
          recurrence_start_time?: string | null;
          recurrence_end_time?: string | null;
          recurrence_generated_through?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_category_id_user_id_fkey";
            columns: ["category_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "tasks_goal_id_user_id_fkey";
            columns: ["goal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "tasks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      time_sessions: {
        Row: {
          duration_seconds: number | null;
          edited_at: string | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          note: string | null;
          occurrence_id: string | null;
          source: Database["public"]["Enums"]["time_session_source"];
          started_at: string;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          edited_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          note?: string | null;
          occurrence_id?: string | null;
          source?: Database["public"]["Enums"]["time_session_source"];
          started_at?: string;
          task_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          edited_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          note?: string | null;
          occurrence_id?: string | null;
          source?: Database["public"]["Enums"]["time_session_source"];
          started_at?: string;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_sessions_occurrence_id_task_id_fkey";
            columns: ["occurrence_id", "task_id"];
            isOneToOne: false;
            referencedRelation: "task_occurrences";
            referencedColumns: ["id", "task_id"];
          },
          {
            foreignKeyName: "time_sessions_task_id_user_id_fkey";
            columns: ["task_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          reminders_enabled: boolean;
          remind_task_start: boolean;
          remind_start_lead_min: number;
          remind_deadline: boolean;
          remind_deadline_days: number;
          remind_overdue_high: boolean;
          remind_morning: boolean;
          morning_time: string;
          remind_eod: boolean;
          eod_time: string;
          remind_weekly: boolean;
          weekly_day: number;
          weekly_time: string;
          work_start: string;
          work_end: string;
          created_at: string;
          timezone: string;
          updated_at: string;
          user_id: string;
          week_start_day: number;
          last_review_date: string | null;
        };
        ComputedFields: never;
        Insert: {
          reminders_enabled?: boolean;
          remind_task_start?: boolean;
          remind_start_lead_min?: number;
          remind_deadline?: boolean;
          remind_deadline_days?: number;
          remind_overdue_high?: boolean;
          remind_morning?: boolean;
          morning_time?: string;
          remind_eod?: boolean;
          eod_time?: string;
          remind_weekly?: boolean;
          weekly_day?: number;
          weekly_time?: string;
          work_start?: string;
          work_end?: string;
          created_at?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
          week_start_day?: number;
          last_review_date?: string | null;
        };
        Update: {
          reminders_enabled?: boolean;
          remind_task_start?: boolean;
          remind_start_lead_min?: number;
          remind_deadline?: boolean;
          remind_deadline_days?: number;
          remind_overdue_high?: boolean;
          remind_morning?: boolean;
          morning_time?: string;
          remind_eod?: boolean;
          eod_time?: string;
          remind_weekly?: boolean;
          weekly_day?: number;
          weekly_time?: string;
          work_start?: string;
          work_end?: string;
          created_at?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          week_start_day?: number;
          last_review_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_task_with_occurrence: {
        Args: {
          p_title: string;
          p_date: string;
          p_priority?: Database["public"]["Enums"]["task_priority"];
          p_notes?: string | null;
          p_category_id?: string | null;
          p_deadline?: string | null;
          p_estimated_minutes?: number | null;
          p_start?: string | null;
          p_end?: string | null;
          p_rrule?: string | null;
          p_rec_until?: string | null;
        };
        Returns: string;
      };
      reschedule_occurrences: {
        Args: {
          p_ids: string[];
          p_date: string;
          p_keep_time?: boolean;
          p_start?: string | null;
          p_end?: string | null;
          p_reason?: string | null;
        };
        Returns: { old_id: string; new_id: string; from_date: string }[];
      };
      ai_reserve_call: { Args: { p_feature: string; p_hour_limit: number; p_day_limit: number }; Returns: Json };
      ai_complete_call: {
        Args: { p_id: string; p_status: string; p_model: string; p_input: number; p_output: number; p_cache_read: number; p_cost: number; p_error: string };
        Returns: undefined;
      };
      update_recurrence: {
        Args: { p_task_id: string; p_rule: string; p_from: string; p_until?: string | null; p_start?: string | null; p_end?: string | null };
        Returns: number;
      };
      start_timer: { Args: { p_occurrence_id: string }; Returns: Json };
      stop_timer: { Args: { p_session_id?: string | null; p_ended_at?: string | null }; Returns: Json };
      add_time_entry: {
        Args: { p_occurrence_id: string; p_started_at: string; p_ended_at: string; p_note?: string | null };
        Returns: Json;
      };
      update_time_entry: {
        Args: { p_id: string; p_started_at: string; p_ended_at: string | null; p_note?: string | null };
        Returns: Json;
      };
      undo_reschedule: { Args: { p_old_id: string }; Returns: boolean };
      materialize_task_occurrences: {
        Args: { p_task_id: string; p_dates: string[]; p_through: string };
        Returns: number;
      };
      stop_recurrence: { Args: { p_task_id: string; p_from: string }; Returns: number };
    };
    Enums: {
      app_role: "user" | "admin";
      goal_status: "active" | "completed" | "archived";
      task_event_type:
        | "recurrence_changed"
        | "reschedule_undone"
        | "task_created"
        | "priority_changed"
        | "deadline_changed"
        | "occurrence_created"
        | "status_changed"
        | "rescheduled";
      task_priority: "none" | "low" | "medium" | "high" | "urgent";
      task_status: "new" | "pending" | "done" | "incomplete";
      time_session_source: "timer" | "manual";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin"],
      goal_status: ["active", "completed", "archived"],
      task_event_type: [
        "recurrence_changed",
        "reschedule_undone",
        "task_created",
        "priority_changed",
        "deadline_changed",
        "occurrence_created",
        "status_changed",
        "rescheduled",
      ],
      task_priority: ["none", "low", "medium", "high", "urgent"],
      task_status: ["new", "pending", "done", "incomplete"],
      time_session_source: ["timer", "manual"],
    },
  },
} as const;
