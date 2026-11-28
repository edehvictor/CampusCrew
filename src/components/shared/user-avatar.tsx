import Image from "next/image";

// A shared placeholder, not an identity check or a user-uploaded photograph.
export function UserAvatar({ className = "" }: { className?: string }) {
  return (
    <span className={"avatar user-avatar " + className} aria-hidden="true">
      <Image
        src="/avatars/default-profile.jpg"
        alt=""
        width={96}
        height={96}
        sizes="96px"
      />
    </span>
  );
}
