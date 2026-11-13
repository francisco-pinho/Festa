/** Créditos do jogo (música, jingles e modelos 3D), mostrados no menu principal. */

/** Músicas do Kevin MacLeod (incompetech.com), licença CC BY 4.0: é obrigatório indicar o título. */
export const MUSIC_CREDITS: { title: string; where: string }[] = [
  { title: 'Carefree', where: 'ecrã inicial' },
  { title: 'Island Meet and Greet', where: 'Ilha' },
  { title: 'Volatile Reaction', where: 'Vulcão' },
  { title: 'Master of the Feast', where: 'Castelo' },
  { title: 'Merry Go', where: 'Parque de Diversões' },
  { title: 'Digital Lemonade', where: 'Cidade Neon' },
  { title: 'Monkeys Spinning Monkeys', where: 'minijogos' },
  { title: 'Sneaky Snitch', where: 'minijogos' },
  { title: 'Run Amok', where: 'minijogos' },
  { title: 'Scheming Weasel (faster version)', where: 'minijogos' },
  { title: 'Fluffing a Duck', where: 'minijogos' },
  { title: 'Funk Game Loop', where: 'desportos' },
  { title: 'Happy Happy Game Show', where: 'fim da festa' },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** HTML do painel de créditos. */
export function creditsHtml(): string {
  return `
    <h1>Créditos</h1>
    <div class="credits">
      <h2>Música</h2>
      <p>${MUSIC_CREDITS.map((m) => `«${esc(m.title)}» <small>(${esc(m.where)})</small>`).join(' · ')}</p>
      <p>Kevin MacLeod (incompetech.com)<br>Licensed under Creative Commons: By Attribution 4.0 License<br><small>http://creativecommons.org/licenses/by/4.0/</small></p>
      <h2>Jingles</h2>
      <p>«Music Jingles» — Kenney (kenney.nl), CC0</p>
      <h2>Modelos 3D</h2>
      <p>KayKit (Adventurers, Skeletons, Character Animations, Forest Nature, Dungeon, Medieval Hexagon, Platformer, City Builder, Furniture, Restaurant, Halloween, Holiday, Mixed Bag 1 e 2, Board Game, Fantasy Weapons, RPG Tools, Resource, Block, Prototype e Space Base Bits) — Kay Lousberg (kaylousberg.com), CC0</p>
      <p>Palmeiras, navios, cais e canhão: Pirate Kit — Kenney (kenney.nl), CC0</p>
      <p>«CRT TV» — Timothy Ahene (sketchfab.com/timothyahene) — Sketchfab Free Standard</p>
    </div>`;
}
