import { createFileRoute } from "@tanstack/react-router";
import { useCurrentOrgId, OrgPermGate } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { OrgRoleManager } from "@/components/discord/OrgRoleManager";

export const Route = createFileRoute("/_authenticated/orga/discord-rollen")({
  component: () => (
    <OrgPermGate perm="discord.roles">
      <OrgaDiscordRolesPage />
    </OrgPermGate>
  ),
});

function OrgaDiscordRolesPage() {
  const [orgId] = useCurrentOrgId();

  return (
    <div className="space-y-4">
      <PageHint>
        Hier legt deine Orga eigene Discord-Rollen an (z. B. „IDCP" und „IDCP Leitung"),
        bearbeitet sie und vergibt sie – zusammen mit den vom App-Admin zugeteilten Rollen –
        an eure Mitglieder. Der Bot kann nur Rollen verwalten, die in Discord unterhalb
        seiner eigenen Rolle stehen.
      </PageHint>
      {orgId && <OrgRoleManager orgId={orgId} />}
    </div>
  );
}
