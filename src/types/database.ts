export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Hand-maintained types for the simplified schema (profiles, user_roles, todos). */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string | null; display_name: string | null; created_at: string; updated_at: string };
        Insert: never;
        Update: { display_name?: string | null };
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role: "user" | "admin"; granted_at: string; granted_by: string | null };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "user_roles_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      todos: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          priority: "none" | "low" | "medium" | "high" | "urgent";
          status: "new" | "pending" | "done" | "incomplete";
          scheduled_date: string;
          start_time: string | null;
          end_time: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          priority?: "none" | "low" | "medium" | "high" | "urgent";
          status?: "new" | "pending" | "done" | "incomplete";
          scheduled_date: string;
          start_time?: string | null;
          end_time?: string | null;
        };
        Update: {
          title?: string;
          priority?: "none" | "low" | "medium" | "high" | "urgent";
          status?: "new" | "pending" | "done" | "incomplete";
          scheduled_date?: string;
          start_time?: string | null;
          end_time?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      app_role: "user" | "admin";
      task_priority: "none" | "low" | "medium" | "high" | "urgent";
      task_status: "new" | "pending" | "done" | "incomplete";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
