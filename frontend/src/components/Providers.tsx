"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ApiRequestError, setAccessTokenProvider, setOrganizationIdProvider, syncUser } from "@/lib/api";
import { getPrivyProfile } from "@/lib/privy-profile";

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
		const profile = getPrivyProfile(user);
		const synchronize = () => syncUser(profile);
		synchronize()
			.catch((error) => {
				if (error instanceof ApiRequestError && error.status === 403 && window.localStorage.getItem(ORGANIZATION_STORAGE_KEY)) {
					window.localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
					return synchronize();
				}
				throw error;
			})
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
		<PrivyProvider
			appId={appId}
			config={{
				loginMethods: ["email", "google"],
				embeddedWallets: {
					ethereum: { createOnLogin: "off" },
					solana: { createOnLogin: "off" },
				},
				appearance: { theme: "dark", accentColor: "#FF1301", showWalletLoginFirst: false },
			}}
		>
			<QueryClientProvider client={client}>
				<AuthBridge>{children}</AuthBridge>
				<Toaster theme="dark" position="bottom-right" richColors />
			</QueryClientProvider>
		</PrivyProvider>
	);
}
