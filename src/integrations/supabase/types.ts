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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          org_id: string | null
          summary: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_components: {
        Row: {
          blueprint_id: string
          created_at: string
          external_uuid: string | null
          id: string
          item_name: string
          item_ref: string | null
          kind: string | null
          position: number
          qty: number
          quantity_scu: number | null
          slot_label: string
          unit: string
          weight: number
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          external_uuid?: string | null
          id?: string
          item_name: string
          item_ref?: string | null
          kind?: string | null
          position?: number
          qty?: number
          quantity_scu?: number | null
          slot_label: string
          unit?: string
          weight?: number
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          external_uuid?: string | null
          id?: string
          item_name?: string
          item_ref?: string | null
          kind?: string | null
          position?: number
          qty?: number
          quantity_scu?: number | null
          slot_label?: string
          unit?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_components_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprint_missions: {
        Row: {
          blueprint_id: string
          created_at: string
          faction: string | null
          id: string
          legality_label: string | null
          max_reputation: number | null
          max_standing_name: string | null
          min_reputation: number | null
          min_standing_name: string | null
          mission_giver: string | null
          mission_title: string
          mission_uuid: string
          raw: Json | null
          reward_max: number | null
          reward_min: number | null
          reward_scope: string | null
          star_systems: string[] | null
          web_url: string | null
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          faction?: string | null
          id?: string
          legality_label?: string | null
          max_reputation?: number | null
          max_standing_name?: string | null
          min_reputation?: number | null
          min_standing_name?: string | null
          mission_giver?: string | null
          mission_title: string
          mission_uuid: string
          raw?: Json | null
          reward_max?: number | null
          reward_min?: number | null
          reward_scope?: string | null
          star_systems?: string[] | null
          web_url?: string | null
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          faction?: string | null
          id?: string
          legality_label?: string | null
          max_reputation?: number | null
          max_standing_name?: string | null
          min_reputation?: number | null
          min_standing_name?: string | null
          mission_giver?: string | null
          mission_title?: string
          mission_uuid?: string
          raw?: Json | null
          reward_max?: number | null
          reward_min?: number | null
          reward_scope?: string | null
          star_systems?: string[] | null
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blueprint_missions_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      blueprints: {
        Row: {
          base_stats: Json | null
          craft_time_seconds: number | null
          created_at: string
          external_uuid: string | null
          id: string
          is_default: boolean
          item_name: string
          item_ref: string | null
          last_synced_at: string | null
          modifiers_fetched_at: string | null
          notes: string | null
          output_modifiers: Json | null
          output_qty: number
          output_uuid: string | null
          owner_id: string | null
          source: string
          source_mission_ref: string | null
          source_url: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          base_stats?: Json | null
          craft_time_seconds?: number | null
          created_at?: string
          external_uuid?: string | null
          id?: string
          is_default?: boolean
          item_name: string
          item_ref?: string | null
          last_synced_at?: string | null
          modifiers_fetched_at?: string | null
          notes?: string | null
          output_modifiers?: Json | null
          output_qty?: number
          output_uuid?: string | null
          owner_id?: string | null
          source?: string
          source_mission_ref?: string | null
          source_url?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          base_stats?: Json | null
          craft_time_seconds?: number | null
          created_at?: string
          external_uuid?: string | null
          id?: string
          is_default?: boolean
          item_name?: string
          item_ref?: string | null
          last_synced_at?: string | null
          modifiers_fetched_at?: string | null
          notes?: string | null
          output_modifiers?: Json | null
          output_qty?: number
          output_uuid?: string | null
          owner_id?: string | null
          source?: string
          source_mission_ref?: string | null
          source_url?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "blueprints_source_mission_ref_fkey"
            columns: ["source_mission_ref"]
            isOneToOne: false
            referencedRelation: "missions_catalog"
            referencedColumns: ["mission_ref"]
          },
        ]
      }
      board_cargo: {
        Row: {
          commodity: string | null
          created_at: string
          id: string
          item_kind: string | null
          item_name: string | null
          item_ref: string | null
          note: string | null
          qty: number
          quality: number | null
          scu: number
          session_id: string
          status: Database["public"]["Enums"]["board_cargo_status"]
          unit: string
          updated_at: string
        }
        Insert: {
          commodity?: string | null
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name?: string | null
          item_ref?: string | null
          note?: string | null
          qty?: number
          quality?: number | null
          scu?: number
          session_id: string
          status?: Database["public"]["Enums"]["board_cargo_status"]
          unit?: string
          updated_at?: string
        }
        Update: {
          commodity?: string | null
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name?: string | null
          item_ref?: string | null
          note?: string | null
          qty?: number
          quality?: number | null
          scu?: number
          session_id?: string
          status?: Database["public"]["Enums"]["board_cargo_status"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_cargo_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          can_transfer_cargo: boolean
          display_name: string
          id: string
          is_commander: boolean
          is_squad_lead: boolean
          joined_at: string
          session_id: string
          token: string
          user_id: string | null
        }
        Insert: {
          can_transfer_cargo?: boolean
          display_name: string
          id?: string
          is_commander?: boolean
          is_squad_lead?: boolean
          joined_at?: string
          session_id: string
          token: string
          user_id?: string | null
        }
        Update: {
          can_transfer_cargo?: boolean
          display_name?: string
          id?: string
          is_commander?: boolean
          is_squad_lead?: boolean
          joined_at?: string
          session_id?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      board_sessions: {
        Row: {
          cargo_cap_scu: number | null
          code: string
          commander_id: string
          created_at: string
          crew_cap: number | null
          custom_name: string | null
          id: string
          mission_id: string | null
          mission_ship_id: string | null
          ship_meta: Json | null
          ship_name: string
          ship_slug: string | null
          status: Database["public"]["Enums"]["board_session_status"]
          updated_at: string
        }
        Insert: {
          cargo_cap_scu?: number | null
          code: string
          commander_id: string
          created_at?: string
          crew_cap?: number | null
          custom_name?: string | null
          id?: string
          mission_id?: string | null
          mission_ship_id?: string | null
          ship_meta?: Json | null
          ship_name: string
          ship_slug?: string | null
          status?: Database["public"]["Enums"]["board_session_status"]
          updated_at?: string
        }
        Update: {
          cargo_cap_scu?: number | null
          code?: string
          commander_id?: string
          created_at?: string
          crew_cap?: number | null
          custom_name?: string | null
          id?: string
          mission_id?: string | null
          mission_ship_id?: string | null
          ship_meta?: Json | null
          ship_name?: string
          ship_slug?: string | null
          status?: Database["public"]["Enums"]["board_session_status"]
          updated_at?: string
        }
        Relationships: []
      }
      board_stations: {
        Row: {
          assigned_member_id: string | null
          category: string | null
          created_at: string
          hardpoint_name: string | null
          id: string
          is_manual: boolean
          label: string
          notes: string | null
          session_id: string
          slot_key: string
          sort_order: number
        }
        Insert: {
          assigned_member_id?: string | null
          category?: string | null
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          is_manual?: boolean
          label: string
          notes?: string | null
          session_id: string
          slot_key: string
          sort_order?: number
        }
        Update: {
          assigned_member_id?: string | null
          category?: string | null
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          is_manual?: boolean
          label?: string
          notes?: string | null
          session_id?: string
          slot_key?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_stations_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "board_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_stations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      board_voice_channels: {
        Row: {
          allow_broadcast: boolean
          created_at: string
          created_by: string | null
          id: string
          is_group_parent: boolean
          is_locked: boolean
          kind: string
          name: string
          parent_id: string | null
          session_id: string
        }
        Insert: {
          allow_broadcast?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_parent?: boolean
          is_locked?: boolean
          kind?: string
          name: string
          parent_id?: string | null
          session_id: string
        }
        Update: {
          allow_broadcast?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_parent?: boolean
          is_locked?: boolean
          kind?: string
          name?: string
          parent_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_voice_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "board_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_voice_channels_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "board_voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_voice_channels_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      board_voice_presence: {
        Row: {
          broadcast_scope: string | null
          channel_id: string
          display_name: string
          id: string
          is_broadcasting: boolean
          is_deafened: boolean
          is_muted: boolean
          joined_at: string
          member_id: string
          session_id: string
        }
        Insert: {
          broadcast_scope?: string | null
          channel_id: string
          display_name: string
          id?: string
          is_broadcasting?: boolean
          is_deafened?: boolean
          is_muted?: boolean
          joined_at?: string
          member_id: string
          session_id: string
        }
        Update: {
          broadcast_scope?: string | null
          channel_id?: string
          display_name?: string
          id?: string
          is_broadcasting?: boolean
          is_deafened?: boolean
          is_muted?: boolean
          joined_at?: string
          member_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_voice_presence_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "board_voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_voice_presence_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "board_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_voice_presence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      craft_history: {
        Row: {
          blueprint_id: string | null
          blueprint_name: string
          components_snapshot: Json
          consumed_snapshot: Json
          created_at: string
          id: string
          output_qty: number
          output_quality: number | null
          user_id: string
        }
        Insert: {
          blueprint_id?: string | null
          blueprint_name: string
          components_snapshot?: Json
          consumed_snapshot?: Json
          created_at?: string
          id?: string
          output_qty: number
          output_quality?: number | null
          user_id?: string
        }
        Update: {
          blueprint_id?: string | null
          blueprint_name?: string
          components_snapshot?: Json
          consumed_snapshot?: Json
          created_at?: string
          id?: string
          output_qty?: number
          output_quality?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "craft_history_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_activity_events: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          created_at: string
          discord_user_id: string
          discord_username: string | null
          event_type: string
          guild_id: string
          id: string
          meta: Json
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          discord_user_id: string
          discord_username?: string | null
          event_type: string
          guild_id: string
          id?: string
          meta?: Json
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          discord_user_id?: string
          discord_username?: string | null
          event_type?: string
          guild_id?: string
          id?: string
          meta?: Json
        }
        Relationships: []
      }
      discord_bot_commands: {
        Row: {
          command: string
          created_at: string
          created_by: string | null
          done_at: string | null
          id: string
          payload: Json
          picked_at: string | null
          result: string | null
          status: string
        }
        Insert: {
          command: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          payload?: Json
          picked_at?: string | null
          result?: string | null
          status?: string
        }
        Update: {
          command?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          id?: string
          payload?: Json
          picked_at?: string | null
          result?: string | null
          status?: string
        }
        Relationships: []
      }
      discord_bot_status: {
        Row: {
          bot_username: string | null
          guild_id: string | null
          guild_name: string | null
          id: string
          last_heartbeat_at: string | null
          member_count: number | null
          online: boolean
          updated_at: string
          version: string | null
          voice_active: number | null
        }
        Insert: {
          bot_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          last_heartbeat_at?: string | null
          member_count?: number | null
          online?: boolean
          updated_at?: string
          version?: string | null
          voice_active?: number | null
        }
        Update: {
          bot_username?: string | null
          guild_id?: string | null
          guild_name?: string | null
          id?: string
          last_heartbeat_at?: string | null
          member_count?: number | null
          online?: boolean
          updated_at?: string
          version?: string | null
          voice_active?: number | null
        }
        Relationships: []
      }
      discord_category_templates: {
        Row: {
          channels: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          source_category_id: string | null
          source_category_name: string | null
          updated_at: string
        }
        Insert: {
          channels?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          source_category_id?: string | null
          source_category_name?: string | null
          updated_at?: string
        }
        Update: {
          channels?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          source_category_id?: string | null
          source_category_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discord_managed_channels: {
        Row: {
          category_id: string
          channel_id: string
          channel_name: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          org_id: string
          updated_at: string
          visibility: string
          visible_role_ids: string[]
        }
        Insert: {
          category_id: string
          channel_id: string
          channel_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id: string
          updated_at?: string
          visibility?: string
          visible_role_ids?: string[]
        }
        Update: {
          category_id?: string
          channel_id?: string
          channel_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          updated_at?: string
          visibility?: string
          visible_role_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "discord_managed_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_managed_roles: {
        Row: {
          color: number
          created_at: string
          created_by: string | null
          discord_role_id: string
          hoist: boolean
          id: string
          mentionable: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          color?: number
          created_at?: string
          created_by?: string | null
          discord_role_id: string
          hoist?: boolean
          id?: string
          mentionable?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          color?: number
          created_at?: string
          created_by?: string | null
          discord_role_id?: string
          hoist?: boolean
          id?: string
          mentionable?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_managed_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_org_categories: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_rename: boolean
          category_id: string
          category_name: string
          created_at: string
          id: string
          max_channels: number
          org_id: string
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_rename?: boolean
          category_id: string
          category_name: string
          created_at?: string
          id?: string
          max_channels?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_rename?: boolean
          category_id?: string
          category_name?: string
          created_at?: string
          id?: string
          max_channels?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_org_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_org_channels: {
        Row: {
          allow_here: boolean
          allow_mentions: boolean
          allow_role_mentions: boolean
          channel_id: string
          channel_name: string
          created_at: string
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          allow_here?: boolean
          allow_mentions?: boolean
          allow_role_mentions?: boolean
          channel_id: string
          channel_name: string
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          allow_here?: boolean
          allow_mentions?: boolean
          allow_role_mentions?: boolean
          channel_id?: string
          channel_name?: string
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_org_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_posts: {
        Row: {
          channel_id: string
          channel_name: string | null
          created_at: string
          embed: Json | null
          id: string
          kind: string
          message_id: string | null
          mission_id: string | null
          org_id: string | null
          posted_by: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          created_at?: string
          embed?: Json | null
          id?: string
          kind?: string
          message_id?: string | null
          mission_id?: string | null
          org_id?: string | null
          posted_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          created_at?: string
          embed?: Json | null
          id?: string
          kind?: string
          message_id?: string | null
          mission_id?: string | null
          org_id?: string | null
          posted_by?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_posts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_reaction_role_panels: {
        Row: {
          body: string
          channel_id: string
          channel_name: string | null
          color: number | null
          created_at: string
          created_by: string | null
          id: string
          message_id: string | null
          options: Json
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          channel_id: string
          channel_name?: string | null
          color?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_id?: string | null
          options?: Json
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel_id?: string
          channel_name?: string | null
          color?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_id?: string | null
          options?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      discord_role_mappings: {
        Row: {
          created_at: string
          discord_role_color: number
          discord_role_id: string
          discord_role_name: string
          enabled: boolean
          id: string
          is_lead: boolean
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discord_role_color?: number
          discord_role_id: string
          discord_role_name: string
          enabled?: boolean
          id?: string
          is_lead?: boolean
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discord_role_color?: number
          discord_role_id?: string
          discord_role_name?: string
          enabled?: boolean
          id?: string
          is_lead?: boolean
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_role_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_settings: {
        Row: {
          created_at: string
          id: boolean
          last_full_sync_at: string | null
          remove_on_role_loss: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          last_full_sync_at?: string | null
          remove_on_role_loss?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          last_full_sync_at?: string | null
          remove_on_role_loss?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      discord_voice_sessions: {
        Row: {
          channel_id: string
          channel_name: string | null
          created_at: string
          discord_user_id: string
          discord_username: string | null
          guild_id: string
          id: string
          joined_at: string
          left_at: string | null
          seconds: number | null
          user_id: string | null
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          created_at?: string
          discord_user_id: string
          discord_username?: string | null
          guild_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          seconds?: number | null
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          created_at?: string
          discord_user_id?: string
          discord_username?: string | null
          guild_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          seconds?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      farm_list_blueprints: {
        Row: {
          blueprint_id: string
          created_at: string
          id: string
          list_id: string
          quantity: number
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          id?: string
          list_id: string
          quantity?: number
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          id?: string
          list_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "farm_list_blueprints_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farm_list_blueprints_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "farm_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_list_contributions: {
        Row: {
          created_at: string
          id: string
          list_id: string
          material_name: string
          material_ref: string
          note: string | null
          qty: number
          quality: number | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          material_name: string
          material_ref: string
          note?: string | null
          qty: number
          quality?: number | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          material_name?: string
          material_ref?: string
          note?: string | null
          qty?: number
          quality?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farm_list_contributions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "farm_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_list_members: {
        Row: {
          created_at: string
          invited_by: string | null
          list_id: string
          role: Database["public"]["Enums"]["farm_list_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          list_id: string
          role?: Database["public"]["Enums"]["farm_list_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          list_id?: string
          role?: Database["public"]["Enums"]["farm_list_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farm_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "farm_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          include_org_warehouse: boolean
          include_personal_inventory: boolean
          invite_role: string
          invite_token: string | null
          name: string
          org_id: string | null
          owner_id: string
          status: Database["public"]["Enums"]["farm_list_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          include_org_warehouse?: boolean
          include_personal_inventory?: boolean
          invite_role?: string
          invite_token?: string | null
          name: string
          org_id?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["farm_list_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          include_org_warehouse?: boolean
          include_personal_inventory?: boolean
          invite_role?: string
          invite_token?: string | null
          name?: string
          org_id?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["farm_list_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farm_lists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_ships: {
        Row: {
          cargo: string | null
          classification: string | null
          count: number
          crew: string | null
          focus: string | null
          image: string | null
          length: string | null
          manufacturer: string | null
          manufacturer_code: string | null
          name: string
          raw: Json | null
          size: string | null
          slug: string
          store_url: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          classification?: string | null
          count?: number
          crew?: string | null
          focus?: string | null
          image?: string | null
          length?: string | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          name: string
          raw?: Json | null
          size?: string | null
          slug: string
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          classification?: string | null
          count?: number
          crew?: string | null
          focus?: string | null
          image?: string | null
          length?: string | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          name?: string
          raw?: Json | null
          size?: string | null
          slug?: string
          store_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fleet_sync_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          ship_count: number | null
          started_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          ship_count?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          ship_count?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      giveaway_entries: {
        Row: {
          created_at: string
          discord_user_id: string | null
          giveaway_id: string
          id: string
          messages: number
          points: number
          reactions: number
          tickets: number
          user_id: string
          voice_seconds: number
        }
        Insert: {
          created_at?: string
          discord_user_id?: string | null
          giveaway_id: string
          id?: string
          messages?: number
          points?: number
          reactions?: number
          tickets?: number
          user_id: string
          voice_seconds?: number
        }
        Update: {
          created_at?: string
          discord_user_id?: string | null
          giveaway_id?: string
          id?: string
          messages?: number
          points?: number
          reactions?: number
          tickets?: number
          user_id?: string
          voice_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_entries_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaway_optins: {
        Row: {
          created_at: string
          discord_user_id: string
          giveaway_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discord_user_id: string
          giveaway_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discord_user_id?: string
          giveaway_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_optins_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaway_winners: {
        Row: {
          created_at: string
          giveaway_id: string
          id: string
          place: number
          tickets: number
          total_tickets: number
          user_id: string
        }
        Insert: {
          created_at?: string
          giveaway_id: string
          id?: string
          place?: number
          tickets?: number
          total_tickets?: number
          user_id: string
        }
        Update: {
          created_at?: string
          giveaway_id?: string
          id?: string
          place?: number
          tickets?: number
          total_tickets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_winners_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaways: {
        Row: {
          announce_channel_id: string | null
          announced_message_id: string | null
          created_at: string
          created_by: string | null
          daily_message_cap: number
          daily_reaction_cap: number
          description: string | null
          draw_seed: string | null
          drawn_at: string | null
          ends_at: string
          id: string
          max_tickets: number
          min_points: number
          min_voice_session_seconds: number
          org_id: string | null
          points_per_message: number
          points_per_reaction: number
          points_per_ticket: number
          points_per_voice_minute: number
          prize: string
          starts_at: string
          status: string
          title: string
          updated_at: string
          winner_count: number
        }
        Insert: {
          announce_channel_id?: string | null
          announced_message_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_message_cap?: number
          daily_reaction_cap?: number
          description?: string | null
          draw_seed?: string | null
          drawn_at?: string | null
          ends_at: string
          id?: string
          max_tickets?: number
          min_points?: number
          min_voice_session_seconds?: number
          org_id?: string | null
          points_per_message?: number
          points_per_reaction?: number
          points_per_ticket?: number
          points_per_voice_minute?: number
          prize?: string
          starts_at?: string
          status?: string
          title: string
          updated_at?: string
          winner_count?: number
        }
        Update: {
          announce_channel_id?: string | null
          announced_message_id?: string | null
          created_at?: string
          created_by?: string | null
          daily_message_cap?: number
          daily_reaction_cap?: number
          description?: string | null
          draw_seed?: string | null
          drawn_at?: string | null
          ends_at?: string
          id?: string
          max_tickets?: number
          min_points?: number
          min_voice_session_seconds?: number
          org_id?: string | null
          points_per_message?: number
          points_per_reaction?: number
          points_per_ticket?: number
          points_per_voice_minute?: number
          prize?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          winner_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "giveaways_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_catalog: {
        Row: {
          acquisition: Json | null
          description: string | null
          image_url: string | null
          item_ref: string
          kind: string | null
          last_synced_at: string | null
          merged_into: string | null
          name: string
          price_buy: number | null
          price_sell: number | null
          raw: Json | null
          shops: Json | null
          source: string
          sources_fetched_at: string | null
          unit: string
          updated_at: string
          weight: number | null
          wiki_uuid: string | null
        }
        Insert: {
          acquisition?: Json | null
          description?: string | null
          image_url?: string | null
          item_ref: string
          kind?: string | null
          last_synced_at?: string | null
          merged_into?: string | null
          name: string
          price_buy?: number | null
          price_sell?: number | null
          raw?: Json | null
          shops?: Json | null
          source?: string
          sources_fetched_at?: string | null
          unit?: string
          updated_at?: string
          weight?: number | null
          wiki_uuid?: string | null
        }
        Update: {
          acquisition?: Json | null
          description?: string | null
          image_url?: string | null
          item_ref?: string
          kind?: string | null
          last_synced_at?: string | null
          merged_into?: string | null
          name?: string
          price_buy?: number | null
          price_sell?: number | null
          raw?: Json | null
          shops?: Json | null
          source?: string
          sources_fetched_at?: string | null
          unit?: string
          updated_at?: string
          weight?: number | null
          wiki_uuid?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          location_id: string | null
          notes: string | null
          offered_qty: number | null
          offered_to_org_id: string | null
          owner_id: string
          qty: number
          qty_reserved: number
          quality: number | null
          unit: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          location_id?: string | null
          notes?: string | null
          offered_qty?: number | null
          offered_to_org_id?: string | null
          owner_id?: string
          qty?: number
          qty_reserved?: number
          quality?: number | null
          unit?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          location_id?: string | null
          notes?: string | null
          offered_qty?: number | null
          offered_to_org_id?: string | null
          owner_id?: string
          qty?: number
          qty_reserved?: number
          quality?: number | null
          unit?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_offered_to_org_id_fkey"
            columns: ["offered_to_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          preset_key: string | null
          source: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          preset_key?: string | null
          source?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          preset_key?: string | null
          source?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      inventory_transfers: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          note: string | null
          qty: number
          quality: number | null
          responded_at: string | null
          source_item_id: string | null
          status: string
          to_user_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          note?: string | null
          qty: number
          quality?: number | null
          responded_at?: string | null
          source_item_id?: string | null
          status?: string
          to_user_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          note?: string | null
          qty?: number
          quality?: number | null
          responded_at?: string | null
          source_item_id?: string | null
          status?: string
          to_user_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_claims: {
        Row: {
          cancel_reason: string | null
          claimed_by: string
          created_at: string
          id: string
          listing_id: string
          note: string | null
          status: Database["public"]["Enums"]["marketplace_claim_status"]
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          claimed_by: string
          created_at?: string
          id?: string
          listing_id: string
          note?: string | null
          status?: Database["public"]["Enums"]["marketplace_claim_status"]
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          claimed_by?: string
          created_at?: string
          id?: string
          listing_id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["marketplace_claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_claims_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string
          expires_at: string | null
          id: string
          image_urls: string[]
          inventory_item_id: string | null
          location: string | null
          org_id: string | null
          org_warehouse_id: string | null
          price_auec: number | null
          quantity: number | null
          scope: Database["public"]["Enums"]["marketplace_scope"]
          status: Database["public"]["Enums"]["marketplace_listing_status"]
          title: string
          trade_offer: string | null
          trade_want: string | null
          type: Database["public"]["Enums"]["marketplace_listing_type"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string
          expires_at?: string | null
          id?: string
          image_urls?: string[]
          inventory_item_id?: string | null
          location?: string | null
          org_id?: string | null
          org_warehouse_id?: string | null
          price_auec?: number | null
          quantity?: number | null
          scope?: Database["public"]["Enums"]["marketplace_scope"]
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          title: string
          trade_offer?: string | null
          trade_want?: string | null
          type: Database["public"]["Enums"]["marketplace_listing_type"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string
          expires_at?: string | null
          id?: string
          image_urls?: string[]
          inventory_item_id?: string | null
          location?: string | null
          org_id?: string | null
          org_warehouse_id?: string | null
          price_auec?: number | null
          quantity?: number | null
          scope?: Database["public"]["Enums"]["marketplace_scope"]
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          title?: string
          trade_offer?: string | null
          trade_want?: string | null
          type?: Database["public"]["Enums"]["marketplace_listing_type"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          listing_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          listing_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_application_fields: {
        Row: {
          active: boolean
          created_at: string
          field_key: string
          field_type: string
          help: string | null
          id: string
          label: string
          options: Json
          placeholder: string | null
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_key: string
          field_type?: string
          help?: string | null
          id?: string
          label: string
          options?: Json
          placeholder?: string | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_key?: string
          field_type?: string
          help?: string | null
          id?: string
          label?: string
          options?: Json
          placeholder?: string | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      membership_application_settings: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          created_at: string
          embed_color: number
          embed_title: string
          enabled: boolean
          id: string
          intro_text: string
          ping_role_id: string | null
          singleton: boolean
          success_text: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          embed_color?: number
          embed_title?: string
          enabled?: boolean
          id?: string
          intro_text?: string
          ping_role_id?: string | null
          singleton?: boolean
          success_text?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          embed_color?: number
          embed_title?: string
          enabled?: boolean
          id?: string
          intro_text?: string
          ping_role_id?: string | null
          singleton?: boolean
          success_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_applications: {
        Row: {
          answers: Json
          channel_id: string | null
          created_at: string
          discord_user_id: string | null
          id: string
          message_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["membership_application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          channel_id?: string | null
          created_at?: string
          discord_user_id?: string | null
          id?: string
          message_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["membership_application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          channel_id?: string | null
          created_at?: string
          discord_user_id?: string | null
          id?: string
          message_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["membership_application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mission_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_participants: {
        Row: {
          display_name: string
          id: string
          is_squad_lead: boolean
          joined_at: string
          mission_id: string
          token: string
          user_id: string | null
        }
        Insert: {
          display_name: string
          id?: string
          is_squad_lead?: boolean
          joined_at?: string
          mission_id: string
          token: string
          user_id?: string | null
        }
        Update: {
          display_name?: string
          id?: string
          is_squad_lead?: boolean
          joined_at?: string
          mission_id?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_participants_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_ship_crew: {
        Row: {
          id: string
          joined_at: string
          mission_ship_id: string
          participant_id: string
          seat_role: string | null
        }
        Insert: {
          id?: string
          joined_at?: string
          mission_ship_id: string
          participant_id: string
          seat_role?: string | null
        }
        Update: {
          id?: string
          joined_at?: string
          mission_ship_id?: string
          participant_id?: string
          seat_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_ship_crew_mission_ship_id_fkey"
            columns: ["mission_ship_id"]
            isOneToOne: false
            referencedRelation: "mission_ships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_ship_crew_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_ship_stations: {
        Row: {
          assigned_participant_id: string | null
          category: string
          created_at: string
          hardpoint_name: string | null
          id: string
          is_manual: boolean
          label: string
          mission_ship_id: string
          slot_key: string
          sort_order: number
        }
        Insert: {
          assigned_participant_id?: string | null
          category?: string
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          is_manual?: boolean
          label: string
          mission_ship_id: string
          slot_key: string
          sort_order?: number
        }
        Update: {
          assigned_participant_id?: string | null
          category?: string
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          is_manual?: boolean
          label?: string
          mission_ship_id?: string
          slot_key?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_ship_stations_assigned_participant_id_fkey"
            columns: ["assigned_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_ship_stations_mission_ship_id_fkey"
            columns: ["mission_ship_id"]
            isOneToOne: false
            referencedRelation: "mission_ships"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_ships: {
        Row: {
          added_by: string | null
          board_session_id: string | null
          created_at: string
          id: string
          manufacturer: string | null
          mission_id: string
          role_tag: string | null
          ship_name: string
          ship_slug: string | null
          status: Database["public"]["Enums"]["ship_op_status"]
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          board_session_id?: string | null
          created_at?: string
          id?: string
          manufacturer?: string | null
          mission_id: string
          role_tag?: string | null
          ship_name: string
          ship_slug?: string | null
          status?: Database["public"]["Enums"]["ship_op_status"]
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          board_session_id?: string | null
          created_at?: string
          id?: string
          manufacturer?: string | null
          mission_id?: string
          role_tag?: string | null
          ship_name?: string
          ship_slug?: string | null
          status?: Database["public"]["Enums"]["ship_op_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_ships_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_ships_board_session_id_fkey"
            columns: ["board_session_id"]
            isOneToOne: false
            referencedRelation: "board_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_ships_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_voice_channels: {
        Row: {
          allow_broadcast: boolean
          created_at: string
          created_by: string | null
          id: string
          is_group_parent: boolean
          is_locked: boolean
          kind: string
          mission_id: string
          name: string
          parent_id: string | null
          ship_id: string | null
          updated_at: string
        }
        Insert: {
          allow_broadcast?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_parent?: boolean
          is_locked?: boolean
          kind?: string
          mission_id: string
          name: string
          parent_id?: string | null
          ship_id?: string | null
          updated_at?: string
        }
        Update: {
          allow_broadcast?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_parent?: boolean
          is_locked?: boolean
          kind?: string
          mission_id?: string
          name?: string
          parent_id?: string | null
          ship_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_voice_channels_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_voice_channels_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mission_voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_voice_channels_ship_id_fkey"
            columns: ["ship_id"]
            isOneToOne: false
            referencedRelation: "mission_ships"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_voice_presence: {
        Row: {
          broadcast_scope: string | null
          channel_id: string
          display_name: string
          id: string
          is_broadcasting: boolean
          is_deafened: boolean
          is_muted: boolean
          joined_at: string
          mission_id: string
          participant_id: string
          updated_at: string
        }
        Insert: {
          broadcast_scope?: string | null
          channel_id: string
          display_name: string
          id?: string
          is_broadcasting?: boolean
          is_deafened?: boolean
          is_muted?: boolean
          joined_at?: string
          mission_id: string
          participant_id: string
          updated_at?: string
        }
        Update: {
          broadcast_scope?: string | null
          channel_id?: string
          display_name?: string
          id?: string
          is_broadcasting?: boolean
          is_deafened?: boolean
          is_muted?: boolean
          joined_at?: string
          mission_id?: string
          participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_voice_presence_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "mission_voice_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_voice_presence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_voice_presence_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          allow_mission_broadcast: boolean
          allow_squadlead_broadcast: boolean
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_hidden: boolean
          is_internal: boolean
          leader_id: string
          org_id: string | null
          password_hash: string | null
          show_in_calendar: boolean
          show_participant_count: boolean
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["mission_status"]
          title: string
          updated_at: string
        }
        Insert: {
          allow_mission_broadcast?: boolean
          allow_squadlead_broadcast?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_hidden?: boolean
          is_internal?: boolean
          leader_id: string
          org_id?: string | null
          password_hash?: string | null
          show_in_calendar?: boolean
          show_participant_count?: boolean
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          title: string
          updated_at?: string
        }
        Update: {
          allow_mission_broadcast?: boolean
          allow_squadlead_broadcast?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_hidden?: boolean
          is_internal?: boolean
          leader_id?: string
          org_id?: string | null
          password_hash?: string | null
          show_in_calendar?: boolean
          show_participant_count?: boolean
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mission_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      missions_catalog: {
        Row: {
          faction: string | null
          location: string | null
          mission_ref: string
          name: string
          payout: number | null
          rank: string | null
          raw: Json | null
          reputation: string | null
          source: string
          updated_at: string
          url: string | null
        }
        Insert: {
          faction?: string | null
          location?: string | null
          mission_ref: string
          name: string
          payout?: number | null
          rank?: string | null
          raw?: Json | null
          reputation?: string | null
          source?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          faction?: string | null
          location?: string | null
          mission_ref?: string
          name?: string
          payout?: number | null
          rank?: string | null
          raw?: Json | null
          reputation?: string | null
          source?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_role_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          org_id: string
          role_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          org_id: string
          role_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          org_id?: string
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_role_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          org_id: string | null
          read_at: string | null
          ref_id: string | null
          ref_table: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_blueprint_settings: {
        Row: {
          allowed_custom_role_ids: string[]
          allowed_roles: string[]
          created_at: string
          org_id: string
          source_mode: string
          updated_at: string
        }
        Insert: {
          allowed_custom_role_ids?: string[]
          allowed_roles?: string[]
          created_at?: string
          org_id: string
          source_mode?: string
          updated_at?: string
        }
        Update: {
          allowed_custom_role_ids?: string[]
          allowed_roles?: string[]
          created_at?: string
          org_id?: string
          source_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_blueprint_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_custom_roles: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_fleet_ships: {
        Row: {
          cargo: string | null
          classification: string | null
          count: number
          crew: string | null
          focus: string | null
          image: string | null
          length: string | null
          manufacturer: string | null
          manufacturer_code: string | null
          name: string
          org_id: string
          size: string | null
          slug: string
          store_url: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          classification?: string | null
          count?: number
          crew?: string | null
          focus?: string | null
          image?: string | null
          length?: string | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          name: string
          org_id: string
          size?: string | null
          slug: string
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          classification?: string | null
          count?: number
          crew?: string | null
          focus?: string | null
          image?: string | null
          length?: string | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          name?: string
          org_id?: string
          size?: string | null
          slug?: string
          store_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_fleet_ships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          custom_role_id: string | null
          joined_at: string
          org_id: string
          permissions: string[]
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          custom_role_id?: string | null
          joined_at?: string
          org_id: string
          permissions?: string[]
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          custom_role_id?: string | null
          joined_at?: string
          org_id?: string
          permissions?: string[]
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "org_custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treasury_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_treasury_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treasury_discord_settings: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          created_at: string
          deposits_show_name: boolean
          last_monthly_posted_at: string | null
          monthly_day: number
          monthly_hour: number
          org_id: string
          post_deposits: boolean
          post_monthly: boolean
          post_withdrawals: boolean
          updated_at: string
          withdrawals_show_name: boolean
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          deposits_show_name?: boolean
          last_monthly_posted_at?: string | null
          monthly_day?: number
          monthly_hour?: number
          org_id: string
          post_deposits?: boolean
          post_monthly?: boolean
          post_withdrawals?: boolean
          updated_at?: string
          withdrawals_show_name?: boolean
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          deposits_show_name?: boolean
          last_monthly_posted_at?: string | null
          monthly_day?: number
          monthly_hour?: number
          org_id?: string
          post_deposits?: boolean
          post_monthly?: boolean
          post_withdrawals?: boolean
          updated_at?: string
          withdrawals_show_name?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "org_treasury_discord_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treasury_entries: {
        Row: {
          amount_auec: number
          booked_at: string
          booked_by: string
          category: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["org_treasury_kind"]
          org_id: string
          player_id: string | null
        }
        Insert: {
          amount_auec: number
          booked_at?: string
          booked_by: string
          category?: string | null
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["org_treasury_kind"]
          org_id: string
          player_id?: string | null
        }
        Update: {
          amount_auec?: number
          booked_at?: string
          booked_by?: string
          category?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["org_treasury_kind"]
          org_id?: string
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_treasury_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_treasury_requests: {
        Row: {
          amount_auec: number
          category: string | null
          created_at: string
          id: string
          kind: string
          org_id: string
          player_id: string
          reason: string | null
          resulting_entry_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_auec: number
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          org_id: string
          player_id: string
          reason?: string | null
          resulting_entry_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_auec?: number
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          player_id?: string
          reason?: string | null
          resulting_entry_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_treasury_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_treasury_requests_resulting_entry_id_fkey"
            columns: ["resulting_entry_id"]
            isOneToOne: false
            referencedRelation: "org_treasury_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      org_warehouse: {
        Row: {
          category: string | null
          deposited_at: string
          deposited_by: string | null
          for_sale: boolean
          held_at: string | null
          held_by: string | null
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          location_id: string | null
          location_label: string | null
          location_since: string | null
          lock_reason: string | null
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          org_id: string
          qty: number
          quality: number | null
          reserved_at: string | null
          reserved_qty: number
          sale_note: string | null
          sale_price: number | null
          sale_qty: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          deposited_at?: string
          deposited_by?: string | null
          for_sale?: boolean
          held_at?: string | null
          held_by?: string | null
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          location_id?: string | null
          location_label?: string | null
          location_since?: string | null
          lock_reason?: string | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          org_id: string
          qty?: number
          quality?: number | null
          reserved_at?: string | null
          reserved_qty?: number
          sale_note?: string | null
          sale_price?: number | null
          sale_qty?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          deposited_at?: string
          deposited_by?: string | null
          for_sale?: boolean
          held_at?: string | null
          held_by?: string | null
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          location_id?: string | null
          location_label?: string | null
          location_since?: string | null
          lock_reason?: string | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          org_id?: string
          qty?: number
          quality?: number | null
          reserved_at?: string | null
          reserved_qty?: number
          sale_note?: string | null
          sale_price?: number | null
          sale_qty?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_warehouse_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_warehouse_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_warehouse_claims: {
        Row: {
          cancelled_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          id: string
          inventory_item_id: string | null
          item_kind: string | null
          item_name: string
          item_ref: string | null
          notes: string | null
          offered_at: string
          offered_by: string
          org_id: string
          qty: number
          quality: number | null
          status: Database["public"]["Enums"]["org_claim_status"]
          unit: string
        }
        Insert: {
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          id?: string
          inventory_item_id?: string | null
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          notes?: string | null
          offered_at?: string
          offered_by: string
          org_id: string
          qty: number
          quality?: number | null
          status?: Database["public"]["Enums"]["org_claim_status"]
          unit?: string
        }
        Update: {
          cancelled_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          id?: string
          inventory_item_id?: string | null
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          notes?: string | null
          offered_at?: string
          offered_by?: string
          org_id?: string
          qty?: number
          quality?: number | null
          status?: Database["public"]["Enums"]["org_claim_status"]
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_warehouse_claims_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_warehouse_claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_warehouse_release_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          notes: string | null
          org_id: string
          qty: number
          release_id: string | null
          requested_by: string
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          qty: number
          release_id?: string | null
          requested_by: string
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          qty?: number
          release_id?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_warehouse_release_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_warehouse_release_requests_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "org_warehouse_releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_warehouse_release_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "org_warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      org_warehouse_releases: {
        Row: {
          created_at: string
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          notes: string | null
          org_id: string
          qty_initial: number
          qty_remaining: number
          quality: number | null
          released_at: string
          released_by: string
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          notes?: string | null
          org_id: string
          qty_initial: number
          qty_remaining: number
          quality?: number | null
          released_at?: string
          released_by: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          notes?: string | null
          org_id?: string
          qty_initial?: number
          qty_remaining?: number
          quality?: number | null
          released_at?: string
          released_by?: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_warehouse_releases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orga_order_reservations: {
        Row: {
          created_at: string
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          order_id: string
          org_id: string
          qty: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          order_id: string
          org_id: string
          qty: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          order_id?: string
          org_id?: string
          qty?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orga_order_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orga_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orga_order_reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orga_order_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "org_warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      orga_orders: {
        Row: {
          analysis_snapshot: Json
          blueprint_id: string | null
          computed_min_quality: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          item_kind: string | null
          item_name: string
          item_ref: string | null
          notes: string | null
          org_id: string
          qty: number
          requested_by: string
          resolve_deep: boolean
          status: string
          updated_at: string
        }
        Insert: {
          analysis_snapshot?: Json
          blueprint_id?: string | null
          computed_min_quality?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          item_kind?: string | null
          item_name: string
          item_ref?: string | null
          notes?: string | null
          org_id: string
          qty: number
          requested_by: string
          resolve_deep?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_snapshot?: Json
          blueprint_id?: string | null
          computed_min_quality?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          item_kind?: string | null
          item_name?: string
          item_ref?: string | null
          notes?: string | null
          org_id?: string
          qty?: number
          requested_by?: string
          resolve_deep?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orga_orders_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orga_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          branding: Json
          created_at: string
          fleet_source: string
          fleetyards_slug: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string
          rsi_sid: string | null
          slug: string
          tag: string | null
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          fleet_source?: string
          fleetyards_slug?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          rsi_sid?: string | null
          slug: string
          tag?: string | null
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          fleet_source?: string
          fleetyards_slug?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          rsi_sid?: string | null
          slug?: string
          tag?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          callsign: string
          created_at: string
          discord_synced_at: string | null
          discord_user_id: string | null
          discord_username: string | null
          display_name: string | null
          fleetyards_last_error: string | null
          fleetyards_last_sync: string | null
          fleetyards_username: string | null
          id: string
          rsi_handle: string | null
          rsi_org_sids: string[]
          rsi_verified_at: string | null
          rsi_verify_attempt_window: string | null
          rsi_verify_attempts: number
          status_text: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          callsign: string
          created_at?: string
          discord_synced_at?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          fleetyards_last_error?: string | null
          fleetyards_last_sync?: string | null
          fleetyards_username?: string | null
          id: string
          rsi_handle?: string | null
          rsi_org_sids?: string[]
          rsi_verified_at?: string | null
          rsi_verify_attempt_window?: string | null
          rsi_verify_attempts?: number
          status_text?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          callsign?: string
          created_at?: string
          discord_synced_at?: string | null
          discord_user_id?: string | null
          discord_username?: string | null
          display_name?: string | null
          fleetyards_last_error?: string | null
          fleetyards_last_sync?: string | null
          fleetyards_username?: string | null
          id?: string
          rsi_handle?: string | null
          rsi_org_sids?: string[]
          rsi_verified_at?: string | null
          rsi_verify_attempt_window?: string | null
          rsi_verify_attempts?: number
          status_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rsi_verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ship_bespoke_components: {
        Row: {
          class_name: string
          created_at: string
          item_ref: string
          port_name: string | null
          ship_slug: string
          source: string
        }
        Insert: {
          class_name: string
          created_at?: string
          item_ref: string
          port_name?: string | null
          ship_slug: string
          source?: string
        }
        Update: {
          class_name?: string
          created_at?: string
          item_ref?: string
          port_name?: string | null
          ship_slug?: string
          source?: string
        }
        Relationships: []
      }
      ship_catalog: {
        Row: {
          angled_view: string | null
          beam_m: number | null
          cargo_scu: number | null
          classification: string | null
          classification_label: string | null
          created_at: string
          crew_max: number | null
          crew_min: number | null
          default_loadout: Json
          description: string | null
          description_de: string | null
          fleetyards_url: string | null
          focus: string | null
          front_view: string | null
          hardpoints: Json
          height_m: number | null
          hero_image: string | null
          holo_url: string | null
          hydrogen_fuel: number | null
          images: Json
          length_m: number | null
          manufacturer: string | null
          manufacturer_code: string | null
          mass_kg: number | null
          max_speed: number | null
          name: string
          paints: Json
          pitch_rate: number | null
          pledge_price_usd: number | null
          price_rent_uec: number | null
          price_source: string | null
          price_synced_at: string | null
          price_uec: number | null
          price_uec_terminal: string | null
          price_uec_terminals: Json
          production_status: string | null
          quantum_fuel: number | null
          raw: Json | null
          roll_rate: number | null
          scm_speed: number | null
          side_view: string | null
          size: string | null
          size_label: string | null
          slug: string
          store_image: string | null
          store_url: string | null
          synced_at: string
          top_view: string | null
          updated_at: string
          yaw_rate: number | null
        }
        Insert: {
          angled_view?: string | null
          beam_m?: number | null
          cargo_scu?: number | null
          classification?: string | null
          classification_label?: string | null
          created_at?: string
          crew_max?: number | null
          crew_min?: number | null
          default_loadout?: Json
          description?: string | null
          description_de?: string | null
          fleetyards_url?: string | null
          focus?: string | null
          front_view?: string | null
          hardpoints?: Json
          height_m?: number | null
          hero_image?: string | null
          holo_url?: string | null
          hydrogen_fuel?: number | null
          images?: Json
          length_m?: number | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          mass_kg?: number | null
          max_speed?: number | null
          name: string
          paints?: Json
          pitch_rate?: number | null
          pledge_price_usd?: number | null
          price_rent_uec?: number | null
          price_source?: string | null
          price_synced_at?: string | null
          price_uec?: number | null
          price_uec_terminal?: string | null
          price_uec_terminals?: Json
          production_status?: string | null
          quantum_fuel?: number | null
          raw?: Json | null
          roll_rate?: number | null
          scm_speed?: number | null
          side_view?: string | null
          size?: string | null
          size_label?: string | null
          slug: string
          store_image?: string | null
          store_url?: string | null
          synced_at?: string
          top_view?: string | null
          updated_at?: string
          yaw_rate?: number | null
        }
        Update: {
          angled_view?: string | null
          beam_m?: number | null
          cargo_scu?: number | null
          classification?: string | null
          classification_label?: string | null
          created_at?: string
          crew_max?: number | null
          crew_min?: number | null
          default_loadout?: Json
          description?: string | null
          description_de?: string | null
          fleetyards_url?: string | null
          focus?: string | null
          front_view?: string | null
          hardpoints?: Json
          height_m?: number | null
          hero_image?: string | null
          holo_url?: string | null
          hydrogen_fuel?: number | null
          images?: Json
          length_m?: number | null
          manufacturer?: string | null
          manufacturer_code?: string | null
          mass_kg?: number | null
          max_speed?: number | null
          name?: string
          paints?: Json
          pitch_rate?: number | null
          pledge_price_usd?: number | null
          price_rent_uec?: number | null
          price_source?: string | null
          price_synced_at?: string | null
          price_uec?: number | null
          price_uec_terminal?: string | null
          price_uec_terminals?: Json
          production_status?: string | null
          quantum_fuel?: number | null
          raw?: Json | null
          roll_rate?: number | null
          scm_speed?: number | null
          side_view?: string | null
          size?: string | null
          size_label?: string | null
          slug?: string
          store_image?: string | null
          store_url?: string | null
          synced_at?: string
          top_view?: string | null
          updated_at?: string
          yaw_rate?: number | null
        }
        Relationships: []
      }
      ship_components_catalog: {
        Row: {
          bespoke_reason: string | null
          category: string
          classification: string | null
          classification_label: string | null
          created_at: string
          description: Json | null
          grade: string | null
          image_url: string | null
          is_bespoke: boolean
          is_craftable: boolean
          item_class: string | null
          item_ref: string
          last_synced_at: string | null
          manufacturer_code: string | null
          manufacturer_name: string | null
          min_price_buy: number | null
          name: string
          raw: Json | null
          shops: Json
          size: number | null
          slug: string | null
          sub_type: string | null
          sub_type_label: string | null
          type: string | null
          type_label: string | null
          updated_at: string
          web_url: string | null
          wiki_uuid: string
        }
        Insert: {
          bespoke_reason?: string | null
          category: string
          classification?: string | null
          classification_label?: string | null
          created_at?: string
          description?: Json | null
          grade?: string | null
          image_url?: string | null
          is_bespoke?: boolean
          is_craftable?: boolean
          item_class?: string | null
          item_ref: string
          last_synced_at?: string | null
          manufacturer_code?: string | null
          manufacturer_name?: string | null
          min_price_buy?: number | null
          name: string
          raw?: Json | null
          shops?: Json
          size?: number | null
          slug?: string | null
          sub_type?: string | null
          sub_type_label?: string | null
          type?: string | null
          type_label?: string | null
          updated_at?: string
          web_url?: string | null
          wiki_uuid: string
        }
        Update: {
          bespoke_reason?: string | null
          category?: string
          classification?: string | null
          classification_label?: string | null
          created_at?: string
          description?: Json | null
          grade?: string | null
          image_url?: string | null
          is_bespoke?: boolean
          is_craftable?: boolean
          item_class?: string | null
          item_ref?: string
          last_synced_at?: string | null
          manufacturer_code?: string | null
          manufacturer_name?: string | null
          min_price_buy?: number | null
          name?: string
          raw?: Json | null
          shops?: Json
          size?: number | null
          slug?: string | null
          sub_type?: string | null
          sub_type_label?: string | null
          type?: string | null
          type_label?: string | null
          updated_at?: string
          web_url?: string | null
          wiki_uuid?: string
        }
        Relationships: []
      }
      ship_loadout_builds: {
        Row: {
          created_at: string
          description: string | null
          fleet_ship_id: string | null
          id: string
          is_public: boolean
          name: string
          share_token: string
          ship_slug: string
          slots: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fleet_ship_id?: string | null
          id?: string
          is_public?: boolean
          name: string
          share_token?: string
          ship_slug: string
          slots?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fleet_ship_id?: string | null
          id?: string
          is_public?: boolean
          name?: string
          share_token?: string
          ship_slug?: string
          slots?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ship_loadout_builds_fleet_ship_id_fkey"
            columns: ["fleet_ship_id"]
            isOneToOne: false
            referencedRelation: "user_ships"
            referencedColumns: ["id"]
          },
        ]
      }
      ship_loadout_stations: {
        Row: {
          category: string | null
          created_at: string
          hardpoint_name: string | null
          id: string
          label: string
          notes: string | null
          slot_key: string
          sort_order: number
          template_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          label: string
          notes?: string | null
          slot_key: string
          sort_order?: number
          template_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          hardpoint_name?: string | null
          id?: string
          label?: string
          notes?: string | null
          slot_key?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ship_loadout_stations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ship_loadout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ship_loadout_templates: {
        Row: {
          created_at: string
          id: string
          scope: string
          ship_slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          scope: string
          ship_slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          ship_slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ship_stock_loadouts: {
        Row: {
          class_name: string
          created_at: string
          fetched_at: string
          loadout: Json
          ship_slug: string
          source: string
          updated_at: string
        }
        Insert: {
          class_name: string
          created_at?: string
          fetched_at?: string
          loadout?: Json
          ship_slug: string
          source?: string
          updated_at?: string
        }
        Update: {
          class_name?: string
          created_at?: string
          fetched_at?: string
          loadout?: Json
          ship_slug?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_reservation_allocations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          qty: number
          reservation_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          qty: number
          reservation_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          qty?: number
          reservation_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_reservation_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reservation_allocations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "shop_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reservation_allocations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "org_warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reservation_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          org_id: string
          reservation_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          org_id: string
          reservation_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          org_id?: string
          reservation_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_reservation_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reservation_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "shop_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reservations: {
        Row: {
          buyer_discord_name: string
          buyer_ingame_name: string
          buyer_note: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          internal_notes: string | null
          item_name: string
          item_ref: string | null
          org_id: string
          qty: number
          status: string
          total_price: number
          unit: string
          unit_price: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          buyer_discord_name: string
          buyer_ingame_name: string
          buyer_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_notes?: string | null
          item_name: string
          item_ref?: string | null
          org_id: string
          qty: number
          status?: string
          total_price: number
          unit?: string
          unit_price: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          buyer_discord_name?: string
          buyer_ingame_name?: string
          buyer_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          internal_notes?: string | null
          item_name?: string
          item_ref?: string | null
          org_id?: string
          qty?: number
          status?: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "org_warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blueprint_collection: {
        Row: {
          acquired_at: string
          blueprint_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          blueprint_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          blueprint_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blueprint_collection_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_ships: {
        Row: {
          created_at: string
          custom_name: string | null
          id: string
          location: string | null
          manufacturer: string | null
          notes: string | null
          org_id: string | null
          ship_name: string
          ship_slug: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          notes?: string | null
          org_id?: string | null
          ship_name: string
          ship_slug?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          notes?: string | null
          org_id?: string | null
          ship_name?: string
          ship_slug?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_sync_runs: {
        Row: {
          backfilled_uex: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          inserted: number | null
          pages: number | null
          scanned: number | null
          skipped: number | null
          started_at: string
          status: string
        }
        Insert: {
          backfilled_uex?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          pages?: number | null
          scanned?: number | null
          skipped?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          backfilled_uex?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted?: number | null
          pages?: number | null
          scanned?: number | null
          skipped?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_farm_list: {
        Args: { _list: string; _user: string }
        Returns: boolean
      }
      can_edit_farm_list: {
        Args: { _list: string; _user: string }
        Returns: boolean
      }
      can_write_loadout_template: {
        Args: { _template_id: string }
        Returns: boolean
      }
      create_shop_reservation: {
        Args: {
          _buyer_discord: string
          _buyer_ingame: string
          _buyer_note: string
          _qty: number
          _warehouse_id: string
        }
        Returns: string
      }
      create_shop_reservation_group: {
        Args: {
          _buyer_discord: string
          _buyer_ingame: string
          _buyer_note: string
          _item_name: string
          _item_ref: string
          _org_id: string
          _qty: number
        }
        Returns: string
      }
      crypt_password: {
        Args: { pwd: string }
        Returns: {
          hash: string
        }[]
      }
      current_org_id: { Args: never; Returns: string }
      has_org_perm: {
        Args: { _org: string; _perm: string; _user: string }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["org_role"][]
          _user: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_board_member: {
        Args: { _session: string; _user: string }
        Returns: boolean
      }
      is_farm_list_owner: {
        Args: { _list: string; _user: string }
        Returns: boolean
      }
      is_mission_participant: {
        Args: { _mission: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_org_member_by_slug: {
        Args: { _slug: string; _user: string }
        Returns: boolean
      }
      org_id_from_slug: { Args: { _slug: string }; Returns: string }
      shares_org_with: { Args: { _a: string; _b: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_mission_password: {
        Args: { _mission_id: string; _password: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      board_cargo_status: "loaded" | "unloaded" | "lost"
      board_session_status: "standby" | "in_flight" | "docked"
      farm_list_role: "viewer" | "editor"
      farm_list_status: "active" | "completed" | "archived"
      marketplace_claim_status:
        | "angenommen"
        | "in_lieferung"
        | "geliefert"
        | "abgeschlossen"
        | "storniert"
      marketplace_listing_status:
        | "offen"
        | "angenommen"
        | "in_lieferung"
        | "abgeschlossen"
        | "storniert"
        | "abgelaufen"
      marketplace_listing_type: "auftrag" | "suche" | "verkauf" | "tausch"
      marketplace_scope: "intern" | "allianz"
      membership_application_status: "open" | "accepted" | "rejected"
      mission_status: "draft" | "active" | "completed" | "cancelled"
      org_claim_status: "pending" | "claimed" | "cancelled"
      org_role: "member" | "quartermaster" | "treasurer" | "officer" | "owner"
      org_treasury_kind: "deposit" | "withdraw" | "expense" | "adjust"
      ship_op_status:
        | "ready"
        | "waiting_crew"
        | "enroute_station"
        | "enroute_mission"
        | "disabled"
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
      app_role: ["admin", "user"],
      board_cargo_status: ["loaded", "unloaded", "lost"],
      board_session_status: ["standby", "in_flight", "docked"],
      farm_list_role: ["viewer", "editor"],
      farm_list_status: ["active", "completed", "archived"],
      marketplace_claim_status: [
        "angenommen",
        "in_lieferung",
        "geliefert",
        "abgeschlossen",
        "storniert",
      ],
      marketplace_listing_status: [
        "offen",
        "angenommen",
        "in_lieferung",
        "abgeschlossen",
        "storniert",
        "abgelaufen",
      ],
      marketplace_listing_type: ["auftrag", "suche", "verkauf", "tausch"],
      marketplace_scope: ["intern", "allianz"],
      membership_application_status: ["open", "accepted", "rejected"],
      mission_status: ["draft", "active", "completed", "cancelled"],
      org_claim_status: ["pending", "claimed", "cancelled"],
      org_role: ["member", "quartermaster", "treasurer", "officer", "owner"],
      org_treasury_kind: ["deposit", "withdraw", "expense", "adjust"],
      ship_op_status: [
        "ready",
        "waiting_crew",
        "enroute_station",
        "enroute_mission",
        "disabled",
      ],
    },
  },
} as const
