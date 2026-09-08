import { ArrowLeft } from 'lucide-react';
import { PageHeader } from './ui';

// Rechtstexte: Impressum (§ 5 DDG) und Datenschutzerklärung (Art. 13 DSGVO).
// Diese Komponente liefert nur Kopf + Inhalt; Navbar und Footer kommen aus der
// Route in App.tsx. Hinweis: kein Rechtsrat – im Zweifel juristisch prüfen lassen.

// ====================================================================
//  BETREIBERDATEN – hier die echten Angaben eintragen (Platzhalter ersetzen)
// ====================================================================
const BETREIBER = {
  name: 'Maik Schirling',
  strasse: 'Schulstraße 26',
  ort: '78647 Trossingen',
  email: 'maikyschirling@gmail.com',
  telefon: '0173 4756557',
};
// Stand der Rechtstexte (bei inhaltlichen Änderungen aktualisieren)
const STAND = 'Juli 2026';
// Version + Stand der Tippspiel-Teilnahmebedingungen. Wird beim Zustimmen
// gespeichert – bei inhaltlichen Änderungen HOCHZÄHLEN (siehe TERMS_VERSION im
// Backend, muss identisch sein).
export const TIPP_TERMS_VERSION = '1.0';
const TIPP_TERMS_STAND = '08.09.2026';
// ====================================================================

// Kleine Bausteine für einheitliches Aussehen der Rechtstexte
function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight text-white mt-8 first:mt-0">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14.5px] leading-relaxed text-hl-mute">{children}</p>;
}

function Impressum() {
  return (
    <>
      <H>Angaben gemäß § 5 DDG</H>
      <P>{BETREIBER.name}</P>
      <P>
        {BETREIBER.strasse}
        <br />
        {BETREIBER.ort}
      </P>

      <H>Kontakt</H>
      <P>
        E-Mail: {BETREIBER.email}
        <br />
        Telefon: {BETREIBER.telefon}
      </P>

      <H>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</H>
      <P>
        {BETREIBER.name}
        <br />
        {BETREIBER.strasse}, {BETREIBER.ort}
      </P>

      <H>Haftung für Inhalte</H>
      <P>
        Die Inhalte dieser Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und
        Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß den
        allgemeinen Gesetzen für eigene Inhalte auf diesen Seiten verantwortlich, jedoch nicht verpflichtet,
        übermittelte oder gespeicherte fremde Informationen zu überwachen.
      </P>

      <H>Haftung für Links</H>
      <P>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die
        Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden
        von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </P>

      <H>Urheberrecht</H>
      <P>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen
        Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Downloads und Kopien dieser Seite sind nur für den
        privaten, nicht kommerziellen Gebrauch gestattet.
      </P>

      <H>Verbraucherstreitbeilegung</H>
      <P>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen. (Hinweis: Die EU-Plattform zur Online-Streitbeilegung wurde zum
        20. Juli 2025 eingestellt; ein entsprechender Link entfällt daher.)
      </P>

      <P>
        <span className="text-hl-faint">Stand: {STAND}</span>
      </P>
    </>
  );
}

function Datenschutz() {
  return (
    <>
      <P>
        Wir freuen uns über dein Interesse an der Hero League. Der Schutz deiner personenbezogenen Daten ist uns wichtig.
        Nachfolgend informieren wir dich gemäß Art. 13 DSGVO darüber, welche Daten wir verarbeiten.
      </P>

      <H>Verantwortlicher</H>
      <P>
        Verantwortlich im Sinne der DSGVO ist:
        <br />
        {BETREIBER.name}
        <br />
        {BETREIBER.strasse}, {BETREIBER.ort}
        <br />
        E-Mail: {BETREIBER.email}
      </P>

      <H>Hosting (Vercel)</H>
      <P>
        Diese Website wird bei der Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, USA) gehostet. Beim Aufruf der
        Seite verarbeitet Vercel technisch notwendige Verbindungsdaten in unserem Auftrag. Eine Datenübermittlung in die
        USA kann stattfinden; diese ist durch Standardvertragsklauseln der EU-Kommission abgesichert. Rechtsgrundlage ist
        unser berechtigtes Interesse an einem sicheren und effizienten Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Es besteht
        ein Auftragsverarbeitungsvertrag.
      </P>

      <H>Server-Logfiles</H>
      <P>
        Beim Besuch der Website werden automatisch Informationen erfasst, die dein Browser übermittelt: IP-Adresse,
        Datum und Uhrzeit des Zugriffs, aufgerufene Seite/Datei, Referrer-URL sowie Browser- und Betriebssystem-Angaben.
        Diese Daten dienen der Sicherheit, Stabilität und Auswertung des technischen Betriebs (Art. 6 Abs. 1 lit. f
        DSGVO) und werden nach kurzer Zeit gelöscht bzw. anonymisiert. Eine Zusammenführung mit anderen Daten erfolgt
        nicht.
      </P>

      <H>Cookies</H>
      <P>
        Auf den öffentlichen Seiten setzen wir keine Tracking- oder Marketing-Cookies. Lediglich im geschützten
        Administrationsbereich wird nach dem Login ein technisch notwendiges, verschlüsseltes Sitzungs-Cookie gesetzt,
        das die Anmeldung aufrechterhält. Dieses Cookie ist für den Betrieb erforderlich und daher nach § 25 Abs. 2
        TDDDG einwilligungsfrei (Art. 6 Abs. 1 lit. f DSGVO). Ein Cookie-Banner ist daher nicht erforderlich.
      </P>

      <H>Bilder &amp; Medien (Vercel Blob)</H>
      <P>
        Hochgeladene Bilder (z. B. Vereins- und Spielerbilder) werden über den Speicherdienst Vercel Blob gespeichert und
        ausgeliefert. Die Verarbeitung erfolgt zur Darstellung der Liga-Inhalte (Art. 6 Abs. 1 lit. f DSGVO).
      </P>

      <H>Datenbank (Neon)</H>
      <P>
        Die Liga-Daten werden in einer Neon-Postgres-Datenbank gespeichert. Personenbezug besteht dabei im Wesentlichen
        nur bei den im öffentlichen Ligabetrieb verwendeten Spielernamen und -statistiken (Art. 6 Abs. 1 lit. f DSGVO).
      </P>

      <H>Tippspiel-Teilnahme</H>
      <P>
        Für die Teilnahme am Tippspiel verarbeiten wir die von dir angegebenen Daten: Vorname, Nachname, E-Mail-Adresse,
        Alter sowie freiwillige Angaben (wie du von uns erfahren hast, Verbesserungsvorschläge) und deine abgegebenen
        Tipps. Zweck ist die Durchführung des Tippspiels inkl. Rangliste und Gewinnabwicklung; Rechtsgrundlage ist die
        Durchführung der Teilnahme (Art. 6 Abs. 1 lit. b DSGVO) sowie deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).
        In der öffentlichen Rangliste erscheinen nur ein verkürzter Anzeigename (Vorname + erster Buchstabe des Nachnamens)
        und die Punkte – keine E-Mail-Adresse. Die Daten werden bis zum Abschluss der Season One und der Gewinnabwicklung
        gespeichert und danach gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen; eine
        Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen.
      </P>
      <P>
        Zur Bestätigung deiner E-Mail versenden wir einen Code über den Dienst <b className="text-white">Resend</b>
        {' '}(Resend, Inc., USA). Zum Schutz vor automatisierten Anmeldungen (Bots) setzen wir{' '}
        <b className="text-white">Cloudflare Turnstile</b> ein (Cloudflare, Inc., USA); dabei wird deine IP-Adresse an
        Cloudflare übermittelt. Rechtsgrundlage ist unser berechtigtes Interesse an einem missbrauchsfreien Betrieb
        (Art. 6 Abs. 1 lit. f DSGVO). Für Übermittlungen in die USA bestehen Standardvertragsklauseln.
      </P>
      <P>
        Zur Wiedererkennung deiner Anmeldung speichern wir eine Kennung lokal in deinem Browser (localStorage). Diese
        verlässt dein Gerät nicht und dient nur dazu, dich für das Tippspiel eingeloggt zu halten; du kannst sie durch
        Abmelden oder Leeren der Browserdaten entfernen. Deine Zustimmung zu den Teilnahmebedingungen wird mit Zeitpunkt
        und Dokumentversion gespeichert (Nachweis der Einwilligung). Deine Tippspiel-Daten werden weder verkauft noch an
        Amazon oder sonstige Dritte zu Werbezwecken weitergegeben. Die Löschung deiner Tippspiel-Daten kannst du
        jederzeit formlos per E-Mail an {BETREIBER.email} verlangen.
      </P>

      <H>Kontaktaufnahme</H>
      <P>
        Wenn du uns per E-Mail kontaktierst, verarbeiten wir deine Angaben ausschließlich zur Bearbeitung deiner Anfrage
        (Art. 6 Abs. 1 lit. b bzw. f DSGVO). Die Daten werden gelöscht, sobald sie nicht mehr benötigt werden und keine
        gesetzlichen Aufbewahrungspflichten entgegenstehen.
      </P>

      <H>Keine Analyse- und Tracking-Tools</H>
      <P>
        Wir verwenden keine Web-Analyse-Dienste, keine Werbe-Pixel und kein nutzerübergreifendes Tracking. Deine Daten
        werden nicht zu Werbezwecken verkauft oder weitergegeben.
      </P>

      <H>Externe Links (Twitch)</H>
      <P>
        Auf der Website verlinken wir auf unseren Twitch-Kanal. Es handelt sich um einen reinen Link – es wird kein
        Twitch-Player eingebettet, sodass beim bloßen Besuch unserer Seite keine Daten an Twitch übertragen werden. Erst
        wenn du den Link anklickst und Twitch aufrufst, gelten die Datenschutzbestimmungen von Twitch.
      </P>

      <H>SSL-/TLS-Verschlüsselung</H>
      <P>
        Diese Seite nutzt aus Sicherheitsgründen eine SSL-/TLS-Verschlüsselung (erkennbar an „https://" in der
        Adresszeile). Dadurch sind die übertragenen Daten für Dritte nicht mitlesbar.
      </P>

      <H>Deine Rechte</H>
      <P>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
        Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie ein Widerspruchsrecht (Art. 21 DSGVO). Eine erteilte
        Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen. Wende dich dafür an die oben genannten
        Kontaktdaten.
      </P>

      <H>Beschwerderecht bei der Aufsichtsbehörde</H>
      <P>
        Unbeschadet anderer Rechtsbehelfe hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren,
        insbesondere in dem Mitgliedstaat deines Aufenthaltsorts, deines Arbeitsplatzes oder des Orts des mutmaßlichen
        Verstoßes. Für den Verantwortlichen zuständig ist der Landesbeauftragte für den Datenschutz und die
        Informationsfreiheit Baden-Württemberg (Lautenschlagerstraße 20, 70173 Stuttgart).
      </P>

      <P>
        <span className="text-hl-faint">Stand: {STAND}</span>
      </P>
    </>
  );
}

// Teilnahmebedingungen HERO League-Tippspiel (Season One).
function Teilnahme() {
  const L = ({ children }: { children: React.ReactNode }) => (
    <li className="text-[14.5px] leading-relaxed text-hl-mute">{children}</li>
  );
  return (
    <>
      <P>
        Diese Teilnahmebedingungen regeln das kostenlose Tippspiel der HERO League zur <b className="text-white">Season One</b>.
        Mit der Anmeldung erklärst du dich mit diesen Bedingungen einverstanden.
      </P>

      <H>1. Veranstalter</H>
      <P>
        Veranstalter ist {BETREIBER.name}, handelnd unter „HERO League", {BETREIBER.strasse}, {BETREIBER.ort}
        <br />
        E-Mail: {BETREIBER.email}
      </P>

      <H>2. Teilnahme &amp; Anmeldung</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <L>Die Teilnahme ist kostenlos. Es besteht keine Kauf-, Einsatz- oder Zahlungspflicht.</L>
        <L>Teilnehmen können natürliche Personen ab <b className="text-white">13 Jahren</b> mit Wohnsitz in Deutschland. Bei Minderjährigen ist die Zustimmung der Erziehungsberechtigten erforderlich.</L>
        <L>Die Anmeldung erfolgt mit Vorname, Nachname, E-Mail-Adresse und Alter sowie einer Bestätigung der E-Mail über einen Code.</L>
        <L>Die Anmeldung kommt erst nach aktiver Zustimmung zu diesen Teilnahmebedingungen zustande.</L>
        <L>Pro Person ist nur eine Teilnahme (eine E-Mail-Adresse) zulässig. Mehrfachanmeldungen können zum Ausschluss führen.</L>
        <L>Spieler, Manager und Schiedsrichter dürfen mitspielen. Vom <b className="text-white">Gewinn ausgeschlossen</b> sind ausschließlich Personen, die technisch Zugriff auf die abgegebenen Tipps haben (Organisatoren/Super-Administratoren).</L>
        <L>Ein Einstieg ist jederzeit während der laufenden Saison möglich. Für bereits gesperrte Spieltage und die bereits gesperrten Bonusfragen werden dann keine Punkte nachträglich vergeben.</L>
      </ul>

      <H>3. Ablauf &amp; Fristen</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <L>Getippt wird das Ergebnis jeder Begegnung eines Spieltags.</L>
        <L>Alle Tipps eines Spieltags werden um <b className="text-white">exakt 19:00 Uhr</b> dieses Spieltags gesperrt – ab 19:00:00 Uhr sind keine neuen Tipps oder Änderungen mehr möglich, auch nicht für später beginnende Begegnungen.</L>
        <L>Die Bonusfragen (Saisontipps) können ausschließlich <b className="text-white">vor dem ersten Spieltag</b> beantwortet und geändert werden. Ab 19:00:00 Uhr am ersten Spieltag bleiben sie für die gesamte Saison gesperrt.</L>
        <L>Der nächste Spieltag öffnet zur Tippabgabe jeweils am <b className="text-white">Montag um 00:00 Uhr</b> nach dem vorherigen Spieltag.</L>
        <L>Alle Fristen gelten nach deutscher Ortszeit (Europe/Berlin, inkl. Sommer-/Winterzeit). Maßgeblich ist die Serverzeit.</L>
      </ul>

      <H>4. Punktewertung</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <L><b className="text-white">Volltreffer</b> (exaktes Ergebnis): 5 Punkte.</L>
        <L><b className="text-white">Richtige Tordifferenz</b> bei Spielen mit Sieger (auch: richtig getipptes Unentschieden, aber nicht exakt): 3 Punkte.</L>
        <L><b className="text-white">Richtiger Sieger/Tendenz</b> (Abstand falsch): 2 Punkte.</L>
        <L>Bei einem Unentschieden zählt nur das exakte Ergebnis (5) oder ein anderes Unentschieden (3); ein Tipp auf einen Sieger gibt 0 Punkte.</L>
        <L>Ein nicht abgegebener Tipp ergibt 0 Punkte. Ein tatsächlich gespieltes 0:0 ist von einem fehlenden Ergebnis zu unterscheiden.</L>
        <L>Bonusfragen bringen je 5 Punkte, der Saisonsieger-Tipp 10 Punkte (aufgelöst anhand der offiziellen Abschlusswerte der Season One).</L>
      </ul>

      <H>5. Wertungszeitraum</H>
      <P>
        Gewertet werden alle regulären Spieltage der Season One (erster bis letzter Spieltag). Testspieltage zählen nicht
        zur Wertung. Das Tippspiel endet automatisch mit dem letzten Spieltag der Season One.
      </P>

      <H>6. Gewinn &amp; Rangliste</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <L>Es gewinnt die Person mit der höchsten Gesamtpunktzahl aus Spieltags- und Bonuspunkten.</L>
        <L>Preis: ein Amazon.de-Gutschein im Wert von <b className="text-white">100&nbsp;Euro</b>.</L>
        <L>Gewinnvoraussetzung ist, dass die gewinnende Person dem offiziellen HERO-League-Kanal folgt. Folgt sie nicht, rückt die nächstplatzierte Person nach (usw.).</L>
        <L>Bei Punktgleichheit an der Spitze entscheidet das Los unter den punktgleichen Erstplatzierten.</L>
        <L>Die Benachrichtigung erfolgt per E-Mail an die bei der Anmeldung angegebene Adresse; der Gutschein wird per E-Mail übermittelt.</L>
        <L>In der öffentlichen Rangliste werden nur ein verkürzter Anzeigename (Vorname + erster Buchstabe des Nachnamens) und die Punkte angezeigt – keine E-Mail-Adresse oder sonstige Kontaktdaten.</L>
      </ul>

      <H>7. Spielausfälle &amp; Korrekturen</H>
      <P>
        Grundsätzlich finden alle Begegnungen wie geplant statt. Sollte eine Begegnung dennoch verlegt, abgebrochen,
        ausgefallen oder nachträglich korrigiert werden, richtet sich die Wertung nach dem offiziellen Endergebnis der
        HERO League; die Rangliste wird dann entsprechend neu berechnet.
      </P>

      <H>8. Manipulation &amp; Ausschluss</H>
      <P>
        Bei Manipulationsversuchen, technischem Missbrauch, Mehrfachanmeldungen oder Verstößen gegen diese Bedingungen
        kann der Veranstalter Teilnehmer von der Wertung ausschließen. Eine Auszahlung des Gewinns in bar ist
        ausgeschlossen.
      </P>

      <H>9. Datenschutz</H>
      <P>
        Informationen zur Verarbeitung deiner personenbezogenen Daten findest du in unserer{' '}
        <a href="/datenschutz" className="text-brand-accent-light hover:underline">Datenschutzerklärung</a>. Deine
        Teilnahme ist nicht an eine Einwilligung in Werbung, Newsletter oder die Veröffentlichung von Fotos gekoppelt.
      </P>

      <H>10. Sonstiges</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <L>Dieses Tippspiel steht in keiner Verbindung zu Amazon; Amazon ist weder Sponsor noch Partner und unterstützt oder verwaltet das Tippspiel nicht.</L>
        <L>Der Veranstalter kann das Tippspiel bei technischen Störungen oder aus wichtigem Grund anpassen oder beenden.</L>
        <L>Es gilt deutsches Recht. Sollten einzelne Bestimmungen unwirksam sein, bleibt der übrige Teil wirksam.</L>
      </ul>

      <P>
        <span className="text-hl-faint">Version {TIPP_TERMS_VERSION} · Stand: {TIPP_TERMS_STAND}</span>
      </P>
    </>
  );
}

interface LegalPageProps {
  kind: 'impressum' | 'datenschutz' | 'teilnahme';
  onBack: () => void;
}

// Vollständige Rechtsseite (Kopf + Karte mit Text + Zurück-Link).
export default function LegalPage({ kind, onBack }: LegalPageProps) {
  const title = kind === 'impressum' ? 'Impressum' : kind === 'teilnahme' ? 'Teilnahmebedingungen' : 'Datenschutz';
  const text =
    kind === 'impressum'
      ? 'Anbieterkennzeichnung und Pflichtangaben nach § 5 DDG.'
      : kind === 'teilnahme'
        ? 'Teilnahmebedingungen für das HERO League-Tippspiel (Season One).'
        : 'Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO.';
  return (
    <>
      <PageHeader kicker="RECHTLICHES" title={title} text={text} />
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-14">
        <div className="hl-card p-6 sm:p-8 space-y-3">
          {kind === 'impressum' ? <Impressum /> : kind === 'teilnahme' ? <Teilnahme /> : <Datenschutz />}
        </div>
        <button
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Zurück zur Startseite
        </button>
      </div>
    </>
  );
}
