use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

#[derive(Default)]
pub struct PanelAutoHideCoordinator {
    suspended_count: AtomicUsize,
}

impl PanelAutoHideCoordinator {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn suspend(self: &Arc<Self>) -> PanelAutoHideSuspendGuard {
        self.suspended_count.fetch_add(1, Ordering::SeqCst);
        PanelAutoHideSuspendGuard {
            coordinator: Arc::clone(self),
        }
    }

    pub fn is_suspended(&self) -> bool {
        self.suspended_count.load(Ordering::SeqCst) > 0
    }
}

pub struct PanelAutoHideSuspendGuard {
    coordinator: Arc<PanelAutoHideCoordinator>,
}

impl Drop for PanelAutoHideSuspendGuard {
    fn drop(&mut self) {
        self.coordinator
            .suspended_count
            .fetch_sub(1, Ordering::SeqCst);
    }
}
