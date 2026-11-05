import { Suspense } from "react";
import ContactDetailView from "@/components/ContactDetailView";
import { LoadingBlock } from "@/components/ui";

async function Detail({ params }: { params: PageProps<"/contacts/[id]">["params"] }) {
  const { id } = await params;
  return <ContactDetailView id={id} />;
}

// `params` is runtime data; with cacheComponents it must be read under a Suspense boundary.
export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Detail params={params} />
    </Suspense>
  );
}
