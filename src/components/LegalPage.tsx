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
  strasse: 'Achauerstraße 8',
  ort: '78647 Trossingen',
  email: 'maikyschirling@gmail.com',
  telefon: '0173 4756557',
};
// Stand der Rechtstexte (bei inhaltlichen Änderungen aktualisieren)
const STAND = 'Juli 2026';
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

interface LegalPageProps {
  kind: 'impressum' | 'datenschutz';
  onBack: () => void;
}

// Vollständige Rechtsseite (Kopf + Karte mit Text + Zurück-Link).
export default function LegalPage({ kind, onBack }: LegalPageProps) {
  const isImpressum = kind === 'impressum';
  return (
    <>
      <PageHeader
        kicker="RECHTLICHES"
        title={isImpressum ? 'Impressum' : 'Datenschutz'}
        text={
          isImpressum
            ? 'Anbieterkennzeichnung und Pflichtangaben nach § 5 DDG.'
            : 'Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 DSGVO.'
        }
      />
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-14">
        <div className="hl-card p-6 sm:p-8 space-y-3">{isImpressum ? <Impressum /> : <Datenschutz />}</div>
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
