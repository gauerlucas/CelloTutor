// Le nom des notes dit à voix haute (synthèse vocale du navigateur), pour lier l'image de la
// note sur la portée, son nom et son son.

const parle = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** « Ré♭ » → « ré bémol », « Fa♯ » → « fa dièse », « B » → « B ». */
export function texteDit(nom: string): string {
  return nom.replace('♭', ' bémol').replace('♯', ' dièse').replace('𝄫', ' double bémol').replace('𝄪', ' double dièse').toLowerCase();
}

let voixFr: SpeechSynthesisVoice | null | undefined;
function voix(): SpeechSynthesisVoice | null {
  if (voixFr !== undefined && voixFr !== null) return voixFr;
  const vs = window.speechSynthesis.getVoices();
  voixFr = vs.find((v) => v.lang?.toLowerCase().startsWith('fr')) ?? null;
  return voixFr;
}

/** Dit un nom de note, éventuellement après un délai (ms). Sans effet si le navigateur ne parle pas. */
export function direNote(nom: string, dansMs = 0): void {
  if (!parle()) return;
  setTimeout(() => {
    try {
      const u = new SpeechSynthesisUtterance(texteDit(nom));
      u.lang = 'fr-FR';
      u.rate = 0.95;
      const v = voix();
      if (v) u.voice = v;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* pas de voix : tant pis */
    }
  }, dansMs);
}
