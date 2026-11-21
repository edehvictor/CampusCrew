import { LogOut, MapPin, Pencil, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { categories, type Job } from "./model";
import { pilotAreas, profileSchema, type PilotProfile } from "./pilot-types";
import { ProfileBalance } from "./profile-balance";
import { WalletAddress } from "./wallet-address";

export type PilotPanel = "wallet" | "profile" | "account";
const titles = {
  wallet: "Connect your wallet",
  profile: "Complete your profile",
  account: "Your profile",
};

type Props = {
  panel: PilotPanel;
  profile: PilotProfile | null;
  request?: Job;
  connectedAddress?: string;
  accountWallet?: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConnect: () => void;
  onSignIn: () => void;
  onSave: (profile: PilotProfile) => void;
  onEdit: () => void;
  onSignOut: () => void;
};

export function PilotDialog(props: Props) {
  const { panel, profile, request, connectedAddress, accountWallet, busy, error } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formError, setFormError] = useState("");
  const [offerServices, setOfferServices] = useState(Boolean(request || profile?.skills.length));
  const needsServices = Boolean(request);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = profileSchema.safeParse({
      displayName: form.get("name"), area: form.get("area"), bio: offerServices ? form.get("bio") : "",
      skills: form.getAll("skills"), coverage: form.getAll("coverage"),
    });
    if (!result.success || (offerServices && (!result.data.skills.length || !result.data.coverage.length))) {
      setFormError("Add your name and area. If you offer services, choose at least one service and coverage area.");
      return;
    }
    if (request && (!result.data.skills.includes(request.category) || !result.data.coverage.some(area => area === request.area))) {
      setFormError("To apply, include this task’s category and service area in your profile.");
      return;
    }
    setFormError("");
    props.onSave(result.data);
  }

  return (
    <dialog
      className="request-dialog pilot-dialog" aria-labelledby="pilot-dialog-title" ref={dialogRef}
      onCancel={event => { event.preventDefault(); props.onClose(); }}
    >
      <header>
        <h2 id="pilot-dialog-title">{titles[panel]}</h2>
        <button className="button button-icon" type="button" aria-label="Close" disabled={busy} onClick={props.onClose}><X size={19} aria-hidden="true" /></button>
      </header>
      {panel === "wallet" && (
        <div className="pilot-steps">
          <p>Sign in to post tasks, offer services, and manage bookings.</p>
          <p>Use Freighter / Varial or xBull on Stellar Testnet.</p>
          {connectedAddress && <p className="pilot-wallet">{connectedAddress}</p>}
          <button className="button button-primary" type="button" disabled={busy} onClick={connectedAddress ? props.onSignIn : props.onConnect}>
            <Wallet size={17} aria-hidden="true" /> {connectedAddress ? "Sign in with wallet" : "Choose a wallet"}
          </button>
          {connectedAddress && <button className="button button-secondary" type="button" disabled={busy} onClick={props.onConnect}>Use a different wallet</button>}
        </div>
      )}
      {panel === "profile" && (
        <form onSubmit={submit}>
          <p>University of Nigeria, Nsukka</p>
          <div className="form-row">
            <label>Display name<input name="name" maxLength={60} minLength={2} required defaultValue={profile?.displayName} autoFocus /></label>
            <label>Based in<select name="area" defaultValue={profile?.area}>{pilotAreas.map(area => <option key={area}>{area}</option>)}</select></label>
          </div>
          {!needsServices && (
            <label className="profile-check"><input type="checkbox" checked={offerServices} onChange={event => setOfferServices(event.target.checked)} /> I offer services</label>
          )}
          {offerServices && <>
            <fieldset>
              <legend>Services you offer</legend>
              {categories.map(category => (
                <label className="profile-check" key={category}>
                  <input name="skills" type="checkbox" value={category} defaultChecked={category === request?.category || profile?.skills.includes(category)} /> {category}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Areas you cover</legend>
              {pilotAreas.map(area => (
                <label className="profile-check" key={area}>
                  <input name="coverage" type="checkbox" value={area} defaultChecked={area === request?.area || profile?.coverage.includes(area)} /> {area}
                </label>
              ))}
            </fieldset>
            <label>Short bio <textarea name="bio" rows={3} maxLength={300} defaultValue={profile?.bio} placeholder="Tell neighbours what you can help with." /></label>
          </>}
          {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
      )}
      {panel === "account" && (
        <div className="pilot-steps account-overview">
          <div className="account-identity"><span className="avatar">{profile?.displayName.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase()}</span><div><strong>{profile?.displayName}</strong><p><MapPin size={12} aria-hidden="true" /> {profile?.area}</p></div><button className="button button-icon" type="button" aria-label="Edit profile" disabled={busy} onClick={props.onEdit}><Pencil size={16} aria-hidden="true" /></button></div>
          {Boolean(profile?.skills.length) && <div className="account-service-tags">{profile?.skills.map(skill => <span key={skill}>{skill}</span>)}</div>}
          {accountWallet && <WalletAddress address={accountWallet} />}
          {accountWallet && <ProfileBalance key={accountWallet} wallet={accountWallet} />}
          <div className="account-footer"><button className="text-button" type="button" disabled={busy} onClick={props.onConnect}><Wallet size={14} aria-hidden="true" /> Reconnect wallet</button><button className="text-button" type="button" disabled={busy} onClick={props.onSignOut}><LogOut size={14} aria-hidden="true" /> Sign out</button></div>
        </div>
      )}
      {panel !== "profile" && error && <p className="form-error" role="alert">{error}</p>}
    </dialog>
  );
}
