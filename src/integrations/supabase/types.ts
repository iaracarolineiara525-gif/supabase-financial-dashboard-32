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
      automation_contact_events: {
        Row: {
          branch: string | null
          created_at: string
          detail: string | null
          event_type: string
          flow_contact_id: string
          flow_id: string
          id: string
          metadata: Json
          step_order: number | null
        }
        Insert: {
          branch?: string | null
          created_at?: string
          detail?: string | null
          event_type: string
          flow_contact_id: string
          flow_id: string
          id?: string
          metadata?: Json
          step_order?: number | null
        }
        Update: {
          branch?: string | null
          created_at?: string
          detail?: string | null
          event_type?: string
          flow_contact_id?: string
          flow_id?: string
          id?: string
          metadata?: Json
          step_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_contact_events_flow_contact_id_fkey"
            columns: ["flow_contact_id"]
            isOneToOne: false
            referencedRelation: "automation_flow_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_contact_events_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flow_contacts: {
        Row: {
          attempts: number
          contact_id: string | null
          contact_name: string | null
          created_at: string
          current_branch: string
          current_step_order: number
          flow_id: string
          id: string
          last_error: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_response_at: string | null
          last_response_preview: string | null
          last_step_id: string | null
          next_action: string | null
          next_run_at: string | null
          phone_e164: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          current_branch?: string
          current_step_order?: number
          flow_id: string
          id?: string
          last_error?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_response_at?: string | null
          last_response_preview?: string | null
          last_step_id?: string | null
          next_action?: string | null
          next_run_at?: string | null
          phone_e164: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          current_branch?: string
          current_step_order?: number
          flow_id?: string
          id?: string
          last_error?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_response_at?: string | null
          last_response_preview?: string | null
          last_step_id?: string | null
          next_action?: string | null
          next_run_at?: string | null
          phone_e164?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flow_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "message_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flow_contacts_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flow_contacts_last_step_id_fkey"
            columns: ["last_step_id"]
            isOneToOne: false
            referencedRelation: "automation_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          api_channel: string
          created_at: string
          description: string | null
          id: string
          list_id: string | null
          list_name: string | null
          max_attempts: number
          max_steps: number
          name: string
          operator_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_channel?: string
          created_at?: string
          description?: string | null
          id?: string
          list_id?: string | null
          list_name?: string | null
          max_attempts?: number
          max_steps?: number
          name: string
          operator_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_channel?: string
          created_at?: string
          description?: string | null
          id?: string
          list_id?: string | null
          list_name?: string | null
          max_attempts?: number
          max_steps?: number
          name?: string
          operator_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "message_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_steps: {
        Row: {
          branch: string
          created_at: string
          flow_id: string
          id: string
          message_body: string | null
          step_order: number
          template_language: string
          template_name: string | null
          template_parameters: Json
          title: string | null
          updated_at: string
          wait_days: number
          wait_hours: number
          wait_minutes: number
        }
        Insert: {
          branch?: string
          created_at?: string
          flow_id: string
          id?: string
          message_body?: string | null
          step_order: number
          template_language?: string
          template_name?: string | null
          template_parameters?: Json
          title?: string | null
          updated_at?: string
          wait_days?: number
          wait_hours?: number
          wait_minutes?: number
        }
        Update: {
          branch?: string
          created_at?: string
          flow_id?: string
          id?: string
          message_body?: string | null
          step_order?: number
          template_language?: string
          template_name?: string | null
          template_parameters?: Json
          title?: string | null
          updated_at?: string
          wait_days?: number
          wait_hours?: number
          wait_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company_id: string | null
          created_at: string
          document: string | null
          email: string | null
          entry_date: string | null
          exit_date: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          entry_date?: string | null
          exit_date?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          entry_date?: string | null
          exit_date?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          commission_date: string
          created_at: string
          description: string | null
          employee_id: string
          id: string
          installment_id: string | null
          paid_date: string | null
          percentage: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          commission_date: string
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          installment_id?: string | null
          paid_date?: string | null
          percentage?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          commission_date?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          installment_id?: string | null
          paid_date?: string | null
          percentage?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          name: string
          state: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          name: string
          state: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          name?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          id: string
          start_date: string
          total_value: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          start_date: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          start_date?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payments: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          employee_id: string
          id: string
          payment_date: string
          payment_type: string
          receipt_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          employee_id: string
          id?: string
          payment_date: string
          payment_type?: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          employee_id?: string
          id?: string
          payment_date?: string
          payment_type?: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean | null
          company_id: string | null
          created_at: string
          email: string | null
          hire_date: string
          id: string
          name: string
          phone: string | null
          role: string | null
          salary: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          salary?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          hire_date?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          salary?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_bill_installments: {
        Row: {
          created_at: string
          discount: number | null
          due_date: string
          fixed_bill_id: string
          id: string
          installment_number: number
          notes: string | null
          original_value: number | null
          paid_date: string | null
          payment_method: string | null
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          discount?: number | null
          due_date: string
          fixed_bill_id: string
          id?: string
          installment_number: number
          notes?: string | null
          original_value?: number | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          discount?: number | null
          due_date?: string
          fixed_bill_id?: string
          id?: string
          installment_number?: number
          notes?: string | null
          original_value?: number | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_bill_installments_fixed_bill_id_fkey"
            columns: ["fixed_bill_id"]
            isOneToOne: false
            referencedRelation: "fixed_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_bills: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          start_date: string
          total_installments: number
          total_value: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          start_date?: string
          total_installments?: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          start_date?: string
          total_installments?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          boleto_fee: number | null
          contract_id: string
          created_at: string
          due_date: string
          expected_end_date: string | null
          gross_value: number | null
          id: string
          installment_number: number
          net_value: number | null
          paid_date: string | null
          payment_method: string | null
          status: string
          total_installments: number
          updated_at: string
          value: number
        }
        Insert: {
          boleto_fee?: number | null
          contract_id: string
          created_at?: string
          due_date: string
          expected_end_date?: string | null
          gross_value?: number | null
          id?: string
          installment_number: number
          net_value?: number | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          total_installments: number
          updated_at?: string
          value: number
        }
        Update: {
          boleto_fee?: number | null
          contract_id?: string
          created_at?: string
          due_date?: string
          expected_end_date?: string | null
          gross_value?: number | null
          id?: string
          installment_number?: number
          net_value?: number | null
          paid_date?: string | null
          payment_method?: string | null
          status?: string
          total_installments?: number
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          operator_key: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operator_key?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operator_key?: string | null
        }
        Relationships: []
      }
      message_campaign_recipients: {
        Row: {
          attempts: number
          campaign_id: string
          contact_id: string
          contact_name: string | null
          created_at: string
          delivered_at: string | null
          external_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_status_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          outbox_id: string | null
          phone_e164: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          contact_id: string
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_status_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          outbox_id?: string | null
          phone_e164?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          contact_id?: string
          contact_name?: string | null
          created_at?: string
          delivered_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_status_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          outbox_id?: string | null
          phone_e164?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "message_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience_filter: Json
          body: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          dry_run: boolean
          id: string
          list_id: string | null
          list_name: string | null
          max_attempts: number
          name: string
          operator_key: string | null
          owner_id: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          rate_limit_per_minute: number
          scheduled_at: string | null
          started_at: string | null
          status: string
          template_category: string | null
          template_language: string | null
          template_name: string | null
          template_parameters: Json
          timezone: string
          total_contacts: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience_filter?: Json
          body?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          dry_run?: boolean
          id?: string
          list_id?: string | null
          list_name?: string | null
          max_attempts?: number
          name: string
          operator_key?: string | null
          owner_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          rate_limit_per_minute?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_category?: string | null
          template_language?: string | null
          template_name?: string | null
          template_parameters?: Json
          timezone?: string
          total_contacts?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience_filter?: Json
          body?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          dry_run?: boolean
          id?: string
          list_id?: string | null
          list_name?: string | null
          max_attempts?: number
          name?: string
          operator_key?: string | null
          owner_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          rate_limit_per_minute?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_category?: string | null
          template_language?: string | null
          template_name?: string | null
          template_parameters?: Json
          timezone?: string
          total_contacts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "message_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      message_contact_lists: {
        Row: {
          added_at: string
          contact_id: string
          created_at: string
          id: string
          list_name: string
          source: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          created_at?: string
          id?: string
          list_name: string
          source?: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          created_at?: string
          id?: string
          list_name?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_contact_lists_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "message_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_contacts: {
        Row: {
          consent_at: string | null
          consent_category: string
          consent_channel: string | null
          consent_metadata: Json
          consent_notice_version: string | null
          consent_source: string | null
          consent_status: string
          created_at: string
          email: string | null
          full_name: string
          group_name: string | null
          id: string
          last_error: string | null
          last_sent_at: string | null
          notes: string | null
          opt_out_at: string | null
          owner_id: string | null
          phone_e164: string
          phone_valid: boolean
          source: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          consent_category?: string
          consent_channel?: string | null
          consent_metadata?: Json
          consent_notice_version?: string | null
          consent_source?: string | null
          consent_status?: string
          created_at?: string
          email?: string | null
          full_name: string
          group_name?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          notes?: string | null
          opt_out_at?: string | null
          owner_id?: string | null
          phone_e164: string
          phone_valid?: boolean
          source?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          consent_category?: string
          consent_channel?: string | null
          consent_metadata?: Json
          consent_notice_version?: string | null
          consent_source?: string | null
          consent_status?: string
          created_at?: string
          email?: string | null
          full_name?: string
          group_name?: string | null
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          notes?: string | null
          opt_out_at?: string | null
          owner_id?: string | null
          phone_e164?: string
          phone_valid?: boolean
          source?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_conversation_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          media_caption: string | null
          media_duration: number | null
          media_id: string | null
          media_mime_type: string | null
          media_sha256: string | null
          media_storage_path: string | null
          message_type: string
          operator_key: string | null
          outbox_id: string | null
          processing_status: string
          provider_timestamp: string | null
          raw_payload: Json
          sender_phone_e164: string | null
          status: string
          template_name: string | null
          transcription: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          media_caption?: string | null
          media_duration?: number | null
          media_id?: string | null
          media_mime_type?: string | null
          media_sha256?: string | null
          media_storage_path?: string | null
          message_type?: string
          operator_key?: string | null
          outbox_id?: string | null
          processing_status?: string
          provider_timestamp?: string | null
          raw_payload?: Json
          sender_phone_e164?: string | null
          status?: string
          template_name?: string | null
          transcription?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          media_caption?: string | null
          media_duration?: number | null
          media_id?: string | null
          media_mime_type?: string | null
          media_sha256?: string | null
          media_storage_path?: string | null
          message_type?: string
          operator_key?: string | null
          outbox_id?: string | null
          processing_status?: string
          provider_timestamp?: string | null
          raw_payload?: Json
          sender_phone_e164?: string | null
          status?: string
          template_name?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "message_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_conversation_messages_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "message_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      message_conversations: {
        Row: {
          contact_id: string | null
          contact_name: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          last_template_name: string | null
          origin_list: string | null
          phone_e164: string
          service_window_expires_at: string | null
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_template_name?: string | null
          origin_list?: string | null
          phone_e164: string
          service_window_expires_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_template_name?: string | null
          origin_list?: string | null
          phone_e164?: string
          service_window_expires_at?: string | null
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "message_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      message_events: {
        Row: {
          created_at: string
          event_hash: string
          event_type: string
          external_id: string
          id: string
          normalized_status: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_hash: string
          event_type: string
          external_id: string
          id?: string
          normalized_status: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event_hash?: string
          event_type?: string
          external_id?: string
          id?: string
          normalized_status?: string
          payload?: Json
        }
        Relationships: []
      }
      message_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_outbox: {
        Row: {
          accepted_at: string | null
          actor_id: string | null
          attempts: number
          body_preview: string | null
          campaign_id: string | null
          created_at: string
          delivered_at: string | null
          dry_run: boolean
          external_id: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          message_type: string
          operator_key: string | null
          provider_error_code: string | null
          read_at: string | null
          recipient_id: string | null
          retry_at: string | null
          sent_at: string | null
          status: string
          template_name: string | null
          to_phone_e164: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          actor_id?: string | null
          attempts?: number
          body_preview?: string | null
          campaign_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dry_run?: boolean
          external_id?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          message_type: string
          operator_key?: string | null
          provider_error_code?: string | null
          read_at?: string | null
          recipient_id?: string | null
          retry_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          to_phone_e164: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          actor_id?: string | null
          attempts?: number
          body_preview?: string | null
          campaign_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dry_run?: boolean
          external_id?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          message_type?: string
          operator_key?: string | null
          provider_error_code?: string | null
          read_at?: string | null
          recipient_id?: string | null
          retry_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          to_phone_e164?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "message_campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      message_send_rate_windows: {
        Row: {
          bucket_start: string
          operator_key: string
          sent_count: number
          updated_at: string
        }
        Insert: {
          bucket_start: string
          operator_key: string
          sent_count?: number
          updated_at?: string
        }
        Update: {
          bucket_start?: string
          operator_key?: string
          sent_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      message_suppression: {
        Row: {
          created_at: string
          id: string
          phone_e164: string
          reason: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          phone_e164: string
          reason?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string
          source?: string | null
        }
        Relationships: []
      }
      meta_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          id: string
          payload: Json
          payload_hash: string
          processed_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          id?: string
          payload?: Json
          payload_hash: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          id?: string
          payload?: Json
          payload_hash?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      v4_operator_roles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          operator_key: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          operator_key: string
          role: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          operator_key?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      v4_pin_attempts: {
        Row: {
          created_at: string
          failed_attempts: number
          fingerprint: string
          id: string
          last_attempt_at: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          fingerprint: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          fingerprint?: string
          id?: string
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      v4_pin_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          operator_key: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          operator_key?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          operator_key?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      automation_register_response: {
        Args: { p_now?: string; p_phone_e164: string; p_preview: string }
        Returns: number
      }
      v4_claim_send_slot: {
        Args: { p_limit: number; p_now?: string; p_operator_key: string }
        Returns: Json
      }
      v4_pin_login_attempt: {
        Args: {
          p_configured_pin_hash: string
          p_fingerprint: string
          p_now?: string
          p_pin_hash: string
          p_session_expires_at: string
          p_session_hash: string
        }
        Returns: Json
      }
      v4_pin_revoke_session: {
        Args: { p_session_hash: string }
        Returns: undefined
      }
      v4_pin_validate_session: {
        Args: { p_now?: string; p_session_hash: string }
        Returns: Json
      }
      v4_record_inbound_message: {
        Args: {
          p_body: string
          p_contact_name: string
          p_external_id: string
          p_message_type: string
          p_phone_e164: string
          p_provider_timestamp: string
          p_raw_payload: Json
          p_service_window_expires_at: string
        }
        Returns: Json
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
