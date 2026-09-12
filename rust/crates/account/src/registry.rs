use std::sync::Arc;

use dashmap::DashMap;

use crate::AccountRuntime;

#[derive(Debug, Default)]
pub struct AccountRegistry {
    by_provider: DashMap<String, Vec<Arc<AccountRuntime>>>,
}

impl AccountRegistry {
    pub fn insert(&self, provider: impl Into<String>, account: Arc<AccountRuntime>) {
        self.by_provider
            .entry(provider.into())
            .or_default()
            .push(account);
    }

    pub fn for_provider(&self, provider: &str) -> Vec<Arc<AccountRuntime>> {
        self.by_provider
            .get(provider)
            .map(|accounts| accounts.value().clone())
            .unwrap_or_default()
    }
}
