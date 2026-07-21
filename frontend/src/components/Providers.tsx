"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { setAccessTokenProvider, setOrganizationIdProvider, syncUser } from "@/lib/api";

const ORGANIZATION_STORAGE_KEY = "kivora.organizationId";

function AuthBridge({ children }: { children: React.ReactNode }) {
	const { ready, authenticated, user, getAccessToken } = usePrivy();
	const queryClient = useQueryClient();

	useEffect(() => {
		setAccessTokenProvider(getAccessToken);
		setOrganizationIdProvider(() => typeof window === "undefined" ? null : window.localStorage.getItem(ORGANIZATION_STORAGE_KEY));
		return () => setAccessTokenProvider(null);
	}, [getAccessToken]);

	useEffect(() => {
		if (!ready || !authenticated || !user) return;
		const email = user.email?.address;
		const name = email?.split("@")[0];
		syncUser({ email, name })
			.then((synced) => {
				if (!window.localStorage.getItem(ORGANIZATION_STORAGE_KEY) && synced.organizationId) {
					window.localStorage.setItem(ORGANIZATION_STORAGE_KEY, synced.organizationId);
				}
				return queryClient.invalidateQueries();
			})
			.catch(() => undefined);
	}, [ready, authenticated, user, queryClient]);

	return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
	const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
	const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
	if (!appId)
		return (
			<QueryClientProvider client={client}>
				{children}
				<Toaster theme="dark" position="bottom-right" richColors />
			</QueryClientProvider>
		);
	return (
		<PrivyProvider appId={appId} config={{ loginMethods: ["email", "google"], appearance: { theme: "dark", accentColor: "#FF1301", showWalletLoginFirst: false } }}>
			<QueryClientProvider client={client}>
				<AuthBridge>{children}</AuthBridge>
				<Toaster theme="dark" position="bottom-right" richColors />
			</QueryClientProvider>
		</PrivyProvider>
	);
}
