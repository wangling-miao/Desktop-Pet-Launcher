const pet = document.querySelector(".pet-window img");

window.addEventListener("pointermove", (event) => {
  if (!pet) {
    return;
  }
  const x = (event.clientX / window.innerWidth - 0.5) * 14;
  const y = (event.clientY / window.innerHeight - 0.5) * 14;
  pet.style.setProperty("--tilt-x", `${x}px`);
  pet.style.setProperty("--tilt-y", `${y}px`);
});

const starCount = document.querySelector("[data-stars]");

if (starCount) {
  fetch("https://api.github.com/repos/wangling-miao/Desktop-Pet-Launcher")
    .then((response) => (response.ok ? response.json() : null))
    .then((repo) => {
      if (typeof repo?.stargazers_count === "number") {
        starCount.textContent = `★ ${new Intl.NumberFormat("zh-CN").format(repo.stargazers_count)}`;
      }
    })
    .catch(() => {});
}
