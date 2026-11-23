import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGameState } from "@/lib/game-state";
import { GameRoom } from "@/components/game/game-room";

export default async function GameRoomPage(props: PageProps<"/game/[code]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { code } = await props.params;
  const state = await getGameState(code, user.id);
  if (!state) notFound();
  return <GameRoom initial={{ ...state, serverNow: new Date().toISOString() }} />;
}
