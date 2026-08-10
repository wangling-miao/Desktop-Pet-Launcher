use std::time::Duration;

pub(crate) struct NetworkState {
    pub(crate) client: reqwest::Client,
}

impl NetworkState {
    pub(crate) fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(90))
            .user_agent(concat!("desktop-pet-launcher/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| error.to_string())?;

        Ok(Self { client })
    }
}
