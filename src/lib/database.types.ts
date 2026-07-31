// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Regenerate after any schema change:
//
//   supabase gen types typescript --project-id xgpdfefxarllgykjbppn > src/lib/database.types.ts
//
// (or via the Supabase MCP `generate_typescript_types` tool)
//
// Why this exists: migration 018 added four values to the `discipline` enum in
// Postgres, and the hand-written union in types.ts did not learn about them.
// `Record<Discipline, …>` still typechecked with nine keys, and the first
// property work package white-screened the Work Packages page. A generated enum
// and a hand-written union are two sources of truth; this is the one that is
// derived from the database, and `src/lib/types.ts` now builds on it.

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
      action_permissions: {
        Row: {
          action_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          action_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          action_key?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      change_orders: {
        Row: {
          approval_id: string | null
          co_number: string
          cost_delta: number
          created_at: string | null
          defect_record_id: string | null
          description: string | null
          id: string
          project_id: string
          raised_by: string
          raised_date: string
          schedule_delta_days: number
          status: Database["public"]["Enums"]["change_order_status"]
          title: string
          trigger_type: Database["public"]["Enums"]["change_order_trigger"]
        }
        Insert: {
          approval_id?: string | null
          co_number: string
          cost_delta?: number
          created_at?: string | null
          defect_record_id?: string | null
          description?: string | null
          id?: string
          project_id: string
          raised_by: string
          raised_date?: string
          schedule_delta_days?: number
          status?: Database["public"]["Enums"]["change_order_status"]
          title: string
          trigger_type: Database["public"]["Enums"]["change_order_trigger"]
        }
        Update: {
          approval_id?: string | null
          co_number?: string
          cost_delta?: number
          created_at?: string | null
          defect_record_id?: string | null
          description?: string | null
          id?: string
          project_id?: string
          raised_by?: string
          raised_date?: string
          schedule_delta_days?: number
          status?: Database["public"]["Enums"]["change_order_status"]
          title?: string
          trigger_type?: Database["public"]["Enums"]["change_order_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_defect_record_id_fkey"
            columns: ["defect_record_id"]
            isOneToOne: false
            referencedRelation: "defect_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_inquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          project_type: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          project_type: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          project_type?: string
        }
        Relationships: []
      }
      defect_records: {
        Row: {
          change_order_id: string | null
          class_item_ref: string | null
          closed_date: string | null
          cost_impact: number | null
          created_at: string | null
          description: string | null
          discovered_by: string | null
          discovered_date: string
          disposition: Database["public"]["Enums"]["disposition"]
          id: string
          inspection_event_id: string | null
          is_class_defect: boolean | null
          location_on_vessel: string | null
          ncr_number: string
          project_id: string
          root_cause: Database["public"]["Enums"]["root_cause"]
          schedule_impact_days: number | null
          severity: Database["public"]["Enums"]["defect_severity"]
          status: Database["public"]["Enums"]["defect_status"]
          title: string
          work_package_id: string | null
        }
        Insert: {
          change_order_id?: string | null
          class_item_ref?: string | null
          closed_date?: string | null
          cost_impact?: number | null
          created_at?: string | null
          description?: string | null
          discovered_by?: string | null
          discovered_date?: string
          disposition?: Database["public"]["Enums"]["disposition"]
          id?: string
          inspection_event_id?: string | null
          is_class_defect?: boolean | null
          location_on_vessel?: string | null
          ncr_number: string
          project_id: string
          root_cause?: Database["public"]["Enums"]["root_cause"]
          schedule_impact_days?: number | null
          severity: Database["public"]["Enums"]["defect_severity"]
          status?: Database["public"]["Enums"]["defect_status"]
          title: string
          work_package_id?: string | null
        }
        Update: {
          change_order_id?: string | null
          class_item_ref?: string | null
          closed_date?: string | null
          cost_impact?: number | null
          created_at?: string | null
          description?: string | null
          discovered_by?: string | null
          discovered_date?: string
          disposition?: Database["public"]["Enums"]["disposition"]
          id?: string
          inspection_event_id?: string | null
          is_class_defect?: boolean | null
          location_on_vessel?: string | null
          ncr_number?: string
          project_id?: string
          root_cause?: Database["public"]["Enums"]["root_cause"]
          schedule_impact_days?: number | null
          severity?: Database["public"]["Enums"]["defect_severity"]
          status?: Database["public"]["Enums"]["defect_status"]
          title?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defect_records_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_inspection_event_id_fkey"
            columns: ["inspection_event_id"]
            isOneToOne: false
            referencedRelation: "inspection_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_records_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          doc_number: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_size: number | null
          file_url: string | null
          id: string
          is_class_document: boolean | null
          linked_object_id: string | null
          linked_object_type: Database["public"]["Enums"]["object_type"] | null
          mime_type: string | null
          project_id: string
          revision: string
          status: Database["public"]["Enums"]["document_status"]
          title: string
          uploaded_by: string
          uploaded_date: string
        }
        Insert: {
          created_at?: string | null
          doc_number: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_class_document?: boolean | null
          linked_object_id?: string | null
          linked_object_type?: Database["public"]["Enums"]["object_type"] | null
          mime_type?: string | null
          project_id: string
          revision?: string
          status?: Database["public"]["Enums"]["document_status"]
          title: string
          uploaded_by: string
          uploaded_date?: string
        }
        Update: {
          created_at?: string | null
          doc_number?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_class_document?: boolean | null
          linked_object_id?: string | null
          linked_object_type?: Database["public"]["Enums"]["object_type"] | null
          mime_type?: string | null
          project_id?: string
          revision?: string
          status?: Database["public"]["Enums"]["document_status"]
          title?: string
          uploaded_by?: string
          uploaded_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_events: {
        Row: {
          actual_date: string | null
          class_item_ref: string | null
          created_at: string | null
          defect_count: number | null
          id: string
          inspection_number: string
          inspector_name: string | null
          inspector_role: string
          is_class_inspection: boolean | null
          notes: string | null
          project_id: string
          result: Database["public"]["Enums"]["inspection_result"]
          scheduled_date: string | null
          title: string
          work_package_id: string | null
        }
        Insert: {
          actual_date?: string | null
          class_item_ref?: string | null
          created_at?: string | null
          defect_count?: number | null
          id?: string
          inspection_number: string
          inspector_name?: string | null
          inspector_role: string
          is_class_inspection?: boolean | null
          notes?: string | null
          project_id: string
          result?: Database["public"]["Enums"]["inspection_result"]
          scheduled_date?: string | null
          title: string
          work_package_id?: string | null
        }
        Update: {
          actual_date?: string | null
          class_item_ref?: string | null
          created_at?: string | null
          defect_count?: number | null
          id?: string
          inspection_number?: string
          inspector_name?: string | null
          inspector_role?: string
          is_class_inspection?: boolean | null
          notes?: string | null
          project_id?: string
          result?: Database["public"]["Enums"]["inspection_result"]
          scheduled_date?: string | null
          title?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_events_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          author_name: string
          author_role: Database["public"]["Enums"]["user_role"] | null
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          linked_object_id: string | null
          linked_object_type: Database["public"]["Enums"]["object_type"] | null
          meeting_ref: string | null
          project_id: string
          source: Database["public"]["Enums"]["message_source"]
        }
        Insert: {
          author_id?: string | null
          author_name: string
          author_role?: Database["public"]["Enums"]["user_role"] | null
          body: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          linked_object_id?: string | null
          linked_object_type?: Database["public"]["Enums"]["object_type"] | null
          meeting_ref?: string | null
          project_id: string
          source?: Database["public"]["Enums"]["message_source"]
        }
        Update: {
          author_id?: string | null
          author_name?: string
          author_role?: Database["public"]["Enums"]["user_role"] | null
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          linked_object_id?: string | null
          linked_object_type?: Database["public"]["Enums"]["object_type"] | null
          meeting_ref?: string | null
          project_id?: string
          source?: Database["public"]["Enums"]["message_source"]
        }
        Relationships: []
      }
      ontology_actions: {
        Row: {
          cascades: string[]
          description: string
          is_agent_usable: boolean
          key: string
          label: string
          parameters: Json
          target_type: Database["public"]["Enums"]["object_type"]
        }
        Insert: {
          cascades?: string[]
          description: string
          is_agent_usable?: boolean
          key: string
          label: string
          parameters?: Json
          target_type: Database["public"]["Enums"]["object_type"]
        }
        Update: {
          cascades?: string[]
          description?: string
          is_agent_usable?: boolean
          key?: string
          label?: string
          parameters?: Json
          target_type?: Database["public"]["Enums"]["object_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ontology_actions_target_type_fkey"
            columns: ["target_type"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["key"]
          },
        ]
      }
      ontology_links: {
        Row: {
          cardinality: string
          from_type: Database["public"]["Enums"]["object_type"]
          id: string
          label: string
          to_type: Database["public"]["Enums"]["object_type"]
          via_column: string
        }
        Insert: {
          cardinality: string
          from_type: Database["public"]["Enums"]["object_type"]
          id?: string
          label: string
          to_type: Database["public"]["Enums"]["object_type"]
          via_column: string
        }
        Update: {
          cardinality?: string
          from_type?: Database["public"]["Enums"]["object_type"]
          id?: string
          label?: string
          to_type?: Database["public"]["Enums"]["object_type"]
          via_column?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_links_from_type_fkey"
            columns: ["from_type"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "ontology_links_to_type_fkey"
            columns: ["to_type"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["key"]
          },
        ]
      }
      ontology_object_types: {
        Row: {
          description: string
          display_order: number
          key: Database["public"]["Enums"]["object_type"]
          label: string
          table_name: string
        }
        Insert: {
          description: string
          display_order: number
          key: Database["public"]["Enums"]["object_type"]
          label: string
          table_name: string
        }
        Update: {
          description?: string
          display_order?: number
          key?: Database["public"]["Enums"]["object_type"]
          label?: string
          table_name?: string
        }
        Relationships: []
      }
      ontology_vocabulary: {
        Row: {
          applies_to: Database["public"]["Enums"]["project_type"] | null
          created_at: string
          display_order: number
          id: string
          kind: string
          value: string
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["project_type"] | null
          created_at?: string
          display_order?: number
          id?: string
          kind: string
          value: string
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["project_type"] | null
          created_at?: string
          display_order?: number
          id?: string
          kind?: string
          value?: string
        }
        Relationships: []
      }
      owner_approvals: {
        Row: {
          approval_number: string
          approver_name: string | null
          change_order_id: string | null
          cost_amount: number
          created_at: string | null
          deadline: string | null
          decision_date: string | null
          decision_notes: string | null
          description: string | null
          id: string
          project_id: string
          requested_by: string
          requested_date: string
          status: Database["public"]["Enums"]["approval_status"]
          tier: Database["public"]["Enums"]["approval_tier"]
          title: string
        }
        Insert: {
          approval_number: string
          approver_name?: string | null
          change_order_id?: string | null
          cost_amount?: number
          created_at?: string | null
          deadline?: string | null
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          id?: string
          project_id: string
          requested_by: string
          requested_date?: string
          status?: Database["public"]["Enums"]["approval_status"]
          tier: Database["public"]["Enums"]["approval_tier"]
          title: string
        }
        Update: {
          approval_number?: string
          approver_name?: string | null
          change_order_id?: string | null
          cost_amount?: number
          created_at?: string | null
          deadline?: string | null
          decision_date?: string | null
          decision_notes?: string | null
          description?: string | null
          id?: string
          project_id?: string
          requested_by?: string
          requested_date?: string
          status?: Database["public"]["Enums"]["approval_status"]
          tier?: Database["public"]["Enums"]["approval_tier"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_approvals_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          company: string | null
          created_at: string | null
          email: string
          first_seen_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          invited_by_name: string | null
          last_seen_at: string | null
          left_at: string | null
          left_reason: string | null
          name: string
          project_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email: string
          first_seen_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          invited_by_name?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          left_reason?: string | null
          name: string
          project_id: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string
          first_seen_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          invited_by_name?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          left_reason?: string | null
          name?: string
          project_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_delivery: string | null
          actual_start: string | null
          budget_contingency: number | null
          budget_locked: number | null
          budget_spent: number | null
          class_society: Database["public"]["Enums"]["class_society"] | null
          created_at: string | null
          id: string
          name: string
          phase: Database["public"]["Enums"]["project_phase"]
          planned_delivery: string | null
          planned_start: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          survey_due_date: string | null
          vessel_id: string | null
          yard_location: string | null
          yard_name: string | null
        }
        Insert: {
          actual_delivery?: string | null
          actual_start?: string | null
          budget_contingency?: number | null
          budget_locked?: number | null
          budget_spent?: number | null
          class_society?: Database["public"]["Enums"]["class_society"] | null
          created_at?: string | null
          id?: string
          name: string
          phase?: Database["public"]["Enums"]["project_phase"]
          planned_delivery?: string | null
          planned_start?: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          survey_due_date?: string | null
          vessel_id?: string | null
          yard_location?: string | null
          yard_name?: string | null
        }
        Update: {
          actual_delivery?: string | null
          actual_start?: string | null
          budget_contingency?: number | null
          budget_locked?: number | null
          budget_spent?: number | null
          class_society?: Database["public"]["Enums"]["class_society"] | null
          created_at?: string | null
          id?: string
          name?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          planned_delivery?: string | null
          planned_start?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          survey_due_date?: string | null
          vessel_id?: string | null
          yard_location?: string | null
          yard_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_vessel_id_fkey"
            columns: ["vessel_id"]
            isOneToOne: false
            referencedRelation: "vessels"
            referencedColumns: ["id"]
          },
        ]
      }
      vessels: {
        Row: {
          beam: number | null
          build_yard: string | null
          class_number: string | null
          class_society: Database["public"]["Enums"]["class_society"]
          created_at: string | null
          draft: number | null
          flag_state: string
          gross_tonnage: number | null
          hull_id: string
          id: string
          loa: number
          name: string
          vessel_type: string
          year_built: number | null
        }
        Insert: {
          beam?: number | null
          build_yard?: string | null
          class_number?: string | null
          class_society: Database["public"]["Enums"]["class_society"]
          created_at?: string | null
          draft?: number | null
          flag_state: string
          gross_tonnage?: number | null
          hull_id: string
          id?: string
          loa: number
          name: string
          vessel_type: string
          year_built?: number | null
        }
        Update: {
          beam?: number | null
          build_yard?: string | null
          class_number?: string | null
          class_society?: Database["public"]["Enums"]["class_society"]
          created_at?: string | null
          draft?: number | null
          flag_state?: string
          gross_tonnage?: number | null
          hull_id?: string
          id?: string
          loa?: number
          name?: string
          vessel_type?: string
          year_built?: number | null
        }
        Relationships: []
      }
      work_packages: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          actual_hours: number | null
          actual_start: string | null
          class_item_ref: string | null
          class_society: Database["public"]["Enums"]["class_society"] | null
          created_at: string | null
          description: string | null
          discipline: Database["public"]["Enums"]["discipline"]
          id: string
          is_class_item: boolean | null
          planned_cost: number | null
          planned_end: string | null
          planned_hours: number | null
          planned_start: string | null
          project_id: string
          status: Database["public"]["Enums"]["work_package_status"]
          title: string
          trade_contractor: string | null
          wp_number: string
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          class_item_ref?: string | null
          class_society?: Database["public"]["Enums"]["class_society"] | null
          created_at?: string | null
          description?: string | null
          discipline: Database["public"]["Enums"]["discipline"]
          id?: string
          is_class_item?: boolean | null
          planned_cost?: number | null
          planned_end?: string | null
          planned_hours?: number | null
          planned_start?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["work_package_status"]
          title: string
          trade_contractor?: string | null
          wp_number: string
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          class_item_ref?: string | null
          class_society?: Database["public"]["Enums"]["class_society"] | null
          created_at?: string | null
          description?: string | null
          discipline?: Database["public"]["Enums"]["discipline"]
          id?: string
          is_class_item?: boolean | null
          planned_cost?: number | null
          planned_end?: string | null
          planned_hours?: number | null
          planned_start?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["work_package_status"]
          title?: string
          trade_contractor?: string | null
          wp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      world_model_events: {
        Row: {
          after_state: Json
          before_state: Json | null
          cascade_from_event_id: string | null
          event_type: string
          id: string
          object_id: string
          object_type: Database["public"]["Enums"]["object_type"]
          project_id: string
          triggered_at: string | null
          triggered_by: string | null
          triggered_by_name: string | null
        }
        Insert: {
          after_state: Json
          before_state?: Json | null
          cascade_from_event_id?: string | null
          event_type: string
          id?: string
          object_id: string
          object_type: Database["public"]["Enums"]["object_type"]
          project_id: string
          triggered_at?: string | null
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Update: {
          after_state?: Json
          before_state?: Json | null
          cascade_from_event_id?: string | null
          event_type?: string
          id?: string
          object_id?: string
          object_type?: Database["public"]["Enums"]["object_type"]
          project_id?: string
          triggered_at?: string | null
          triggered_by?: string | null
          triggered_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "world_model_events_cascade_from_event_id_fkey"
            columns: ["cascade_from_event_id"]
            isOneToOne: false
            referencedRelation: "world_model_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_model_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      action_advance_project_phase: {
        Args: { p_project_id?: string }
        Returns: Json
      }
      action_amend_defect_impact: {
        Args: {
          p_cost_impact?: number
          p_defect_id: string
          p_description?: string
          p_reason: string
          p_root_cause?: string
          p_schedule_impact_days?: number
        }
        Returns: Json
      }
      action_change_member_role: {
        Args: {
          p_member_id: string
          p_project_id: string
          p_reason?: string
          p_role: string
        }
        Returns: Json
      }
      action_create_project: {
        Args: {
          p_budget_locked?: number
          p_class_society?: string
          p_name: string
          p_planned_delivery?: string
          p_planned_start?: string
          p_project_type?: string
          p_yard_location?: string
          p_yard_name?: string
        }
        Returns: Json
      }
      action_create_work_package: {
        Args: {
          p_class_item_ref?: string
          p_description?: string
          p_discipline: string
          p_is_class_item?: boolean
          p_planned_cost?: number
          p_planned_end?: string
          p_planned_hours?: number
          p_planned_start?: string
          p_project_id?: string
          p_title: string
          p_trade_contractor?: string
        }
        Returns: Json
      }
      action_decide_approval: {
        Args: { p_approval_id: string; p_decision: string; p_notes?: string }
        Returns: Json
      }
      action_invite_member: {
        Args: {
          p_company?: string
          p_email: string
          p_name?: string
          p_project_id: string
          p_role: string
        }
        Returns: Json
      }
      action_link_defect_to_work_package: {
        Args: { p_defect_id: string; p_work_package_id?: string }
        Returns: Json
      }
      action_post_message: {
        Args: {
          p_body: string
          p_kind?: string
          p_linked_object_id?: string
          p_linked_object_type?: string
          p_meeting_ref?: string
          p_project_id?: string
          p_source?: string
        }
        Returns: Json
      }
      action_raise_defect: {
        Args: {
          p_class_item_ref?: string
          p_cost_impact?: number
          p_description: string
          p_disposition: string
          p_inspection_event_id?: string
          p_is_class_defect?: boolean
          p_location_on_vessel: string
          p_project_id?: string
          p_root_cause: string
          p_schedule_impact_days?: number
          p_severity: string
          p_title: string
          p_work_package_id?: string
        }
        Returns: Json
      }
      action_record_inspection_result: {
        Args: {
          p_actual_date?: string
          p_inspection_id: string
          p_notes?: string
          p_result: string
        }
        Returns: Json
      }
      action_record_project_access: {
        Args: { p_project_id: string }
        Returns: Json
      }
      action_register_document: {
        Args: {
          p_doc_type: string
          p_file_size?: number
          p_file_url: string
          p_is_class_document?: boolean
          p_linked_object_id?: string
          p_linked_object_type?: string
          p_mime_type?: string
          p_project_id?: string
          p_title: string
        }
        Returns: Json
      }
      action_remove_member: {
        Args: { p_member_id: string; p_project_id: string; p_reason: string }
        Returns: Json
      }
      action_schedule_inspection: {
        Args: {
          p_class_item_ref?: string
          p_inspector_name?: string
          p_inspector_role: string
          p_is_class_inspection?: boolean
          p_project_id?: string
          p_scheduled_date?: string
          p_title: string
          p_work_package_id?: string
        }
        Returns: Json
      }
      action_update_defect_status: {
        Args: {
          p_closed_date?: string
          p_defect_id: string
          p_notes?: string
          p_status: string
        }
        Returns: Json
      }
      action_update_work_package: {
        Args: {
          p_actual_cost?: number
          p_actual_end?: string
          p_actual_hours?: number
          p_actual_start?: string
          p_planned_cost?: number
          p_planned_end?: string
          p_planned_hours?: number
          p_planned_start?: string
          p_status?: string
          p_trade_contractor?: string
          p_work_package_id: string
        }
        Returns: Json
      }
      approval_days_for_tier: {
        Args: { p_tier: Database["public"]["Enums"]["approval_tier"] }
        Returns: number
      }
      approval_tier_for_cost: {
        Args: { p_cost: number }
        Returns: Database["public"]["Enums"]["approval_tier"]
      }
      can_perform: {
        Args: { p_action_key: string; p_project_id: string }
        Returns: boolean
      }
      current_actor_id: { Args: never; Returns: string }
      current_actor_name: { Args: never; Returns: string }
      current_actor_role: {
        Args: { p_project_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      discipline_abbrev: {
        Args: { p_discipline: Database["public"]["Enums"]["discipline"] }
        Returns: string
      }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      project_phases: {
        Args: { p_project_type: Database["public"]["Enums"]["project_type"] }
        Returns: string[]
      }
      require_approval_authority: {
        Args: { p_approval_id: string }
        Returns: undefined
      }
      require_permission: {
        Args: { p_action_key: string; p_project_id: string }
        Returns: undefined
      }
      require_permission_for_object: {
        Args: {
          p_action_key: string
          p_object_id: string
          p_object_type: string
        }
        Returns: undefined
      }
      resolve_project: { Args: { p_explicit: string }; Returns: string }
    }
    Enums: {
      approval_status: "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED"
      approval_tier: "TIER_1" | "TIER_2" | "TIER_3"
      change_order_status:
        | "DRAFT"
        | "PENDING_APPROVAL"
        | "APPROVED"
        | "REJECTED"
        | "IMPLEMENTED"
      change_order_trigger:
        | "CLASS_REQUIREMENT"
        | "OWNER_REQUEST"
        | "DEFECT_DISCOVERY"
        | "SCOPE_GROWTH"
        | "REGULATORY"
      class_society: "LLOYDS" | "BV" | "RINA" | "DNV" | "ABS" | "OTHER"
      defect_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      defect_status:
        | "OPEN"
        | "IN_PROGRESS"
        | "PENDING_APPROVAL"
        | "CLOSED"
        | "DISPUTED"
      discipline:
        | "STRUCTURAL"
        | "HULL"
        | "MECHANICAL"
        | "ELECTRICAL"
        | "RIGGING"
        | "INTERIOR"
        | "PAINT"
        | "CLASS"
        | "SAFETY"
        | "PLANNING"
        | "CADASTRAL"
        | "ENERGY"
        | "LANDSCAPE"
      disposition: "REPAIR" | "REPLACE" | "MONITOR" | "ACCEPT_AS_IS" | "PENDING"
      doc_type:
        | "SURVEY_REPORT"
        | "CLASS_CERTIFICATE"
        | "DRAWING"
        | "SPECIFICATION"
        | "NCR"
        | "CHANGE_ORDER"
        | "APPROVAL"
        | "CORRESPONDENCE"
        | "PHOTO"
        | "OTHER"
        | "VISURA_CATASTALE"
        | "PLANIMETRIA_CATASTALE"
        | "BUILDING_PERMIT"
        | "AMNESTY"
        | "HABITABILITY"
        | "ENERGY_CERTIFICATE"
        | "DEED"
        | "COMPLIANCE_DECLARATION"
        | "LANDSCAPE_CLEARANCE"
      document_status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "SUPERSEDED"
      inspection_result: "PASS" | "CONDITIONAL_PASS" | "FAIL" | "PENDING"
      membership_status: "INVITED" | "ACTIVE" | "LEFT"
      message_kind:
        | "NOTE"
        | "DECISION"
        | "UNPLANNED_WORK"
        | "MEETING_NOTE"
        | "HANDOVER"
      message_source: "APP" | "MEETING" | "EMAIL"
      object_type:
        | "VESSEL"
        | "PROJECT"
        | "WORK_PACKAGE"
        | "CHANGE_ORDER"
        | "INSPECTION_EVENT"
        | "DEFECT_RECORD"
        | "OWNER_APPROVAL"
        | "DOCUMENT"
        | "SUBCONTRACTOR"
        | "MESSAGE"
        | "PROJECT_MEMBER"
      project_phase:
        | "PRE_SURVEY"
        | "HAUL_OUT"
        | "STRUCTURAL"
        | "SYSTEMS"
        | "INTERIOR"
        | "SEA_TRIALS"
        | "DELIVERED"
        | "DOCUMENT_GATHERING"
        | "SURVEY"
        | "COMPLIANCE_REVIEW"
        | "REMEDIATION"
        | "CERTIFICATION"
      project_type:
        | "FIVE_YEAR_SURVEY"
        | "REFIT"
        | "NEWBUILD"
        | "ANNUAL_SURVEY"
        | "DAMAGE_REPAIR"
        | "PROPERTY"
      root_cause:
        | "WEAR"
        | "CORROSION"
        | "IMPACT"
        | "FATIGUE"
        | "INSTALLATION_ERROR"
        | "DESIGN_DEFICIENCY"
        | "MOISTURE_INGRESS"
        | "OTHER"
        | "UNPERMITTED_WORKS"
        | "CADASTRAL_MISMATCH"
        | "MISSING_CERTIFICATE"
        | "EXPIRED_PERMIT"
      user_role:
        | "OWNERS_REP"
        | "OWNER"
        | "CAPTAIN"
        | "YARD_PM"
        | "CLASS_SURVEYOR"
        | "SUBCONTRACTOR"
        | "NAVAL_ARCHITECT"
      work_package_status:
        | "DRAFT"
        | "SCOPED"
        | "ACTIVE"
        | "EXPANDED"
        | "ON_HOLD"
        | "COMPLETE"
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
      approval_status: ["PENDING", "APPROVED", "REJECTED", "ESCALATED"],
      approval_tier: ["TIER_1", "TIER_2", "TIER_3"],
      change_order_status: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "IMPLEMENTED",
      ],
      change_order_trigger: [
        "CLASS_REQUIREMENT",
        "OWNER_REQUEST",
        "DEFECT_DISCOVERY",
        "SCOPE_GROWTH",
        "REGULATORY",
      ],
      class_society: ["LLOYDS", "BV", "RINA", "DNV", "ABS", "OTHER"],
      defect_severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      defect_status: [
        "OPEN",
        "IN_PROGRESS",
        "PENDING_APPROVAL",
        "CLOSED",
        "DISPUTED",
      ],
      discipline: [
        "STRUCTURAL",
        "HULL",
        "MECHANICAL",
        "ELECTRICAL",
        "RIGGING",
        "INTERIOR",
        "PAINT",
        "CLASS",
        "SAFETY",
        "PLANNING",
        "CADASTRAL",
        "ENERGY",
        "LANDSCAPE",
      ],
      disposition: ["REPAIR", "REPLACE", "MONITOR", "ACCEPT_AS_IS", "PENDING"],
      doc_type: [
        "SURVEY_REPORT",
        "CLASS_CERTIFICATE",
        "DRAWING",
        "SPECIFICATION",
        "NCR",
        "CHANGE_ORDER",
        "APPROVAL",
        "CORRESPONDENCE",
        "PHOTO",
        "OTHER",
        "VISURA_CATASTALE",
        "PLANIMETRIA_CATASTALE",
        "BUILDING_PERMIT",
        "AMNESTY",
        "HABITABILITY",
        "ENERGY_CERTIFICATE",
        "DEED",
        "COMPLIANCE_DECLARATION",
        "LANDSCAPE_CLEARANCE",
      ],
      document_status: ["DRAFT", "UNDER_REVIEW", "APPROVED", "SUPERSEDED"],
      inspection_result: ["PASS", "CONDITIONAL_PASS", "FAIL", "PENDING"],
      membership_status: ["INVITED", "ACTIVE", "LEFT"],
      message_kind: [
        "NOTE",
        "DECISION",
        "UNPLANNED_WORK",
        "MEETING_NOTE",
        "HANDOVER",
      ],
      message_source: ["APP", "MEETING", "EMAIL"],
      object_type: [
        "VESSEL",
        "PROJECT",
        "WORK_PACKAGE",
        "CHANGE_ORDER",
        "INSPECTION_EVENT",
        "DEFECT_RECORD",
        "OWNER_APPROVAL",
        "DOCUMENT",
        "SUBCONTRACTOR",
        "MESSAGE",
        "PROJECT_MEMBER",
      ],
      project_phase: [
        "PRE_SURVEY",
        "HAUL_OUT",
        "STRUCTURAL",
        "SYSTEMS",
        "INTERIOR",
        "SEA_TRIALS",
        "DELIVERED",
        "DOCUMENT_GATHERING",
        "SURVEY",
        "COMPLIANCE_REVIEW",
        "REMEDIATION",
        "CERTIFICATION",
      ],
      project_type: [
        "FIVE_YEAR_SURVEY",
        "REFIT",
        "NEWBUILD",
        "ANNUAL_SURVEY",
        "DAMAGE_REPAIR",
        "PROPERTY",
      ],
      root_cause: [
        "WEAR",
        "CORROSION",
        "IMPACT",
        "FATIGUE",
        "INSTALLATION_ERROR",
        "DESIGN_DEFICIENCY",
        "MOISTURE_INGRESS",
        "OTHER",
        "UNPERMITTED_WORKS",
        "CADASTRAL_MISMATCH",
        "MISSING_CERTIFICATE",
        "EXPIRED_PERMIT",
      ],
      user_role: [
        "OWNERS_REP",
        "OWNER",
        "CAPTAIN",
        "YARD_PM",
        "CLASS_SURVEYOR",
        "SUBCONTRACTOR",
        "NAVAL_ARCHITECT",
      ],
      work_package_status: [
        "DRAFT",
        "SCOPED",
        "ACTIVE",
        "EXPANDED",
        "ON_HOLD",
        "COMPLETE",
      ],
    },
  },
} as const
