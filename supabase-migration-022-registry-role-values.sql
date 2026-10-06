-- =============================================================================
-- YAM Migration 022 — THE AGENT CAN INVITE CREW
--
-- Applied to the live project as `registry_role_values`.
--
-- Migration 019 added CREW to the user_role enum and gave it permissions, but
-- the registry rows for action_invite_member and action_change_member_role
-- kept the seven roles they were written with. The agent builds its tool
-- schemas from those rows, so "add the chef to the project" could only ever be
-- filed as some other role. The values are now read from the enum itself.
--
-- (Disciplines, document types and root causes had the same drift; those are
-- scoped per project type, so the agent now takes them from
-- ontology_vocabulary instead of from these lists.)
-- =============================================================================

with roles as (
  select jsonb_agg(e.enumlabel::text order by e.enumsortorder) as vals
    from pg_enum e
   where e.enumtypid = 'public.user_role'::regtype
)
update ontology_actions a
   set parameters = (
     select jsonb_agg(
              case when p->>'name' = 'p_role'
                   then jsonb_set(p, '{values}', (select vals from roles))
                   else p end
              order by ord)
       from jsonb_array_elements(a.parameters) with ordinality as t(p, ord)
   )
 where a.key in ('action_invite_member', 'action_change_member_role');
