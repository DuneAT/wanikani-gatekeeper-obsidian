import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as wanakana from "wanakana";
import confetti from "canvas-confetti";

interface WaniKaniPluginSettings {
  apiToken: string;
  radicalColor: string;
  kanjiColor: string;
  vocabularyColor: string;
  minReviews: number;
  delayAfterCorrect: number;
  delayAfterIncorrect: number;
  disableUntil?: string;
  dailyProgress?: { [date: string]: number };
}

const DEFAULT_SETTINGS: WaniKaniPluginSettings = {
  apiToken: "",
  radicalColor: "#1173cf",
  kanjiColor: "#e73c83",
  vocabularyColor: "#7725d4",
  minReviews: 0,
  delayAfterCorrect: 1000,
  delayAfterIncorrect: 3000,
  disableUntil: undefined,
  dailyProgress: {},
};

function getTomorrowISOString(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
}

function getTodayKey(): string {
  const today = new Date();
  return today.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function getTodayProgress(settings: WaniKaniPluginSettings): number {
  const key = getTodayKey();
  return settings.dailyProgress?.[key] || 0;
}

function addTodayProgress(settings: WaniKaniPluginSettings, count: number = 1) {
  const key = getTodayKey();
  if (!settings.dailyProgress) settings.dailyProgress = {};
  settings.dailyProgress[key] = (settings.dailyProgress[key] || 0) + count;
}

export default class WaniKaniGatekeeperPlugin extends Plugin {
  settings: WaniKaniPluginSettings;

  async onload() {
    await this.loadSettings();

    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.apiToken) {
        new Notice("WaniKani API Token not set. Please configure in settings.");
        return;
      }

      if (this.settings.disableUntil && new Date() < new Date(this.settings.disableUntil)) {
        // console.log("WaniKani Gatekeeper disabled for today, skipping modal.");
        return;
      }

      try {
        const reviews = await this.getReviews();
        let reviews_dict: {[key: string]: [number, number]} = {};
        reviews.forEach((rev) => {
          reviews_dict[rev.id] = [0,0];
        });
        // console.log("Current reviews:", reviews);
        if (reviews.length != 0) {
          new WaniKaniModal(this.app, this).open();
        }
      } catch (e) {
        console.error("Error fetching WaniKani reviews:", e);
        new Notice("Could not fetch WaniKani reviews.");
      }

    });

    this.addSettingTab(new WaniKaniSettingTab(this.app, this));
  }

  onunload() {}


  async getReviews(): Promise<any[]> {
    const summaryRes = await fetch("https://api.wanikani.com/v2/summary", {
      headers: {
        "Wanikani-Revision": "20170710",
        Authorization: `Bearer ${this.settings.apiToken}`,
      },
    });
  
    if (!summaryRes.ok) throw new Error(`Failed to fetch summary: ${summaryRes.status}`);
  
    const summaryData = await summaryRes.json();
    const availableReviews = summaryData.data.reviews[0].subject_ids;
  
    if (availableReviews.length === 0) return [];
  
    const subjectsRes = await fetch(
      `https://api.wanikani.com/v2/subjects?ids=${availableReviews.join(",")}`,
      {
        headers: {
          "Wanikani-Revision": "20170710",
          Authorization: `Bearer ${this.settings.apiToken}`,
        },
      }
    );
  
    if (!subjectsRes.ok) throw new Error(`Failed to fetch subjects: ${subjectsRes.status}`);
  
    const subjectsData = await subjectsRes.json();
    return subjectsData.data;
  }

  async submitReview(subject_id: number ,incorrect_meaning_answers: number, incorrect_reading_answers: number) {
    const payload = {
      review: {
        subject_id: subject_id,
        incorrect_meaning_answers: incorrect_meaning_answers,
        incorrect_reading_answers: incorrect_reading_answers,
      }
    };
    
  
    const res = await fetch("https://api.wanikani.com/v2/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Wanikani-Revision": "20170710",
        Authorization: `Bearer ${this.settings.apiToken}`,
      },
      body: JSON.stringify(payload),
    });
  
    if (!res.ok) {
      console.error("Failed to submit review:", await res.text());
    } else {
      // console.log(`Submitted review for assignment ${subject_id}`);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


class WaniKaniModal extends Modal {
  plugin: WaniKaniGatekeeperPlugin;
  checkInterval: number | null = null;
  reviews: any[] = [];
  currentIndex: number = 0;
  reviews_dict: {[key: number]: any} = {};
  currentReviewsClear: number = 0;
  todayReviewsClear: number = 0;
  emergencyExitHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(app: App, plugin: WaniKaniGatekeeperPlugin) {
    super(app);
    this.plugin = plugin;
    this.todayReviewsClear = getTodayProgress(this.plugin.settings);
  }

  
  renderNextReview() {
    const { contentEl } = this;
    contentEl.empty();
  
    if (this.currentIndex >= this.reviews.length) {
      new Notice("All WaniKani reviews complete ✅");
      confetti({
        particleCount: 200,
        spread: 70,
        origin: { y: 0.6 }
      });
      setTimeout(() => this.close(), 1500);
      return;
    }

    const closeButton = this.modalEl.querySelector(".modal-close-button") as HTMLElement;
    if (closeButton) {
      closeButton.classList.add("wanikani-hidden");
      closeButton.classList.remove("wanikani-visible");
    }
    
    if (this.todayReviewsClear >= this.plugin.settings.minReviews) {
      const closeButton = this.modalEl.querySelector(".modal-close-button") as HTMLElement;
      if (closeButton) {
        closeButton.classList.remove("wanikani-hidden");
        closeButton.classList.add("wanikani-visible");
      }
    
      const disableBtn = this.contentEl.createEl("button", { text: "Disable for Today", cls: "wanikani-disable-today" });
      disableBtn.onclick = async () => {
          this.plugin.settings.disableUntil = getTomorrowISOString();
          await this.plugin.saveSettings();
          new Notice("WaniKani Gatekeeper disabled until tomorrow ✅");
          this.close();
      };
    }
    
  
    const rev = this.reviews[this.currentIndex];
  
    const needsMeaning = Array.isArray(rev.data.meanings) && rev.data.meanings.length > 0;
    const needsReading = Array.isArray(rev.data.readings) && rev.data.readings.length > 0;

    let headerClass = "wanikani-header";
    if (rev.object === "radical") {headerClass += " radical"; let obj = "radical";}
    else if (rev.object === "kanji") {headerClass += " kanji"; let obj = "kanji";}
    else if (rev.object === "vocabulary") {headerClass += " vocabulary"; let obj = "vocabulary";}
    else if (rev.object === "kana_vocabulary") {headerClass += " radical"; let obj = "kana";};
    contentEl.createDiv({ cls: headerClass}, (header) => {
      header.createEl("h2", { text: `${rev.object.toUpperCase()}`, cls: "wanikani-object" });
      header.createEl("div", { text: rev.data.characters || "", cls: "wanikani-character" });
      header.createEl("div", {text: `Goal: ${this.todayReviewsClear} / ${this.plugin.settings.minReviews}`, cls: "wanikani-remaining-reviews" });
      header.createEl("div", {text: `All: ${this.currentReviewsClear} / ${this.reviews.length}`, cls: "wanikani-done-reviews" });
    });
    let meaningInput: HTMLInputElement | null = null;
    let readingInput: HTMLInputElement | null = null;

    contentEl.createDiv({ cls: "wanikani-section" }, (section) => {
      if (needsMeaning) {
        section.createEl("h1", { text: `Meaning` });
        meaningInput = section.createEl("input", { 
          type: "text", 
          placeholder: "Your Response",
          cls: "wanikani-input"
        }) as HTMLInputElement;
        setTimeout(() => meaningInput?.focus(), 0);
      }
    
      if (needsReading) {
        section.createEl("h1", { text: `Reading` });
      
        readingInput = section.createEl("input", { 
          type: "text", 
          placeholder: "Your Response",
          cls: "wanikani-input"
        }) as HTMLInputElement;
        if (!needsMeaning) setTimeout(() => readingInput?.focus(), 0);
        wanakana.bind(readingInput, { IMEMode: true });
      }
    });
    
    const feedback = this.contentEl.createEl("p", { cls: "wanikani-feedback" });
    const btn = this.contentEl.createEl("button", {cls: "wanikani-submit", text: "Submit" });
    
    const submitOnEnter = (inp: HTMLInputElement | null, btn: HTMLButtonElement) => {
      if (!inp) return;
      inp.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          btn.click();
        }
      });
    };
    
    submitOnEnter(meaningInput, btn);
    submitOnEnter(readingInput, btn);
    btn.onclick = async () => {
      let meaningCorrect = true;
      let readingCorrect = true;
  
      if (needsMeaning && meaningInput) {
        const answer = normalizeAnswer(meaningInput.value);
        const correctMeanings = [
          ...rev.data.meanings.map((m: any) => normalizeAnswer(m.meaning)),
          ...(rev.data.user_synonyms || []).map((s: string) => normalizeAnswer(s))
        ];
        meaningCorrect = correctMeanings.includes(answer);
      }
  
      if (needsReading && readingInput) {
        const answer = normalizeAnswer(readingInput.value);
        const correctReadings = rev.data.readings
          .filter((r: any) => r.primary)
          .map((r: any) => normalizeAnswer(r.reading));
        readingCorrect = correctReadings.includes(answer);
      }

      const isCorrect = meaningCorrect && readingCorrect;
  
      feedback.setText(isCorrect ? "✅ Correct!" : "❌ Incorrect!");
      if (!isCorrect) {
        let messages = [`❌ Incorrect!`];
        if (this.reviews_dict[rev.id]) {
          this.reviews_dict[rev.id].incorrect_meaning_answers += meaningCorrect ? 0 : 1;
          this.reviews_dict[rev.id].incorrect_reading_answers += readingCorrect ? 0 : 1;
        } else {
          this.reviews_dict[rev.id] = {
            subject_id: rev.id,
            incorrect_meaning_answers: meaningCorrect ? 0 : 1,
            incorrect_reading_answers: readingCorrect ? 0 : 1
          };
        }
        if (!readingCorrect) {
        const correctReadings = rev.data.readings
          .filter((r: any) => r.primary)
          .map((r: any) => r.reading)
          .join(", ");
        messages.push(`Correct readings: ${correctReadings}`);
        }
        if (!meaningCorrect) {
        const correctMeanings = rev.data.meanings
          .map((m: any) => m.meaning)
          .join(", ");
        messages.push(`Correct meanings: ${correctMeanings}`);
        }
        feedback.setText(messages.join(" \n "));
        this.currentIndex++;
        setTimeout(() => {this.renderNextReview();}, this.plugin.settings.delayAfterIncorrect);
        return;
      } else {
        let incorrect_meaning_answers = 0;
        let incorrect_reading_answers = 0;
        if (this.reviews_dict[rev.id]) {
          incorrect_meaning_answers = this.reviews_dict[rev.id].incorrect_meaning_answers;
          incorrect_reading_answers = this.reviews_dict[rev.id].incorrect_reading_answers;
          delete this.reviews_dict[rev.id];
        }
        
        await this.plugin.submitReview(rev.id, incorrect_meaning_answers, incorrect_reading_answers);
        this.currentReviewsClear++;
        this.todayReviewsClear++;
        addTodayProgress(this.plugin.settings, 1);
        await this.plugin.saveSettings();
        if (this.todayReviewsClear == this.plugin.settings.minReviews) {
          confetti({
            particleCount: 200,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }  
      this.currentIndex++;
      setTimeout(() => this.renderNextReview(), this.plugin.settings.delayAfterCorrect);
    };
    if (rev.data.characters) {
      contentEl.createEl("p", { text: rev.data.characters, cls: "wanikani-character" });
    }
  }

  async onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Complete your WaniKani Reviews" });
    this.modalEl.addEventListener("mousedown", (e) => {
      if (!this.contentEl.contains(e.target as Node)) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    (this.modalEl.parentElement as HTMLElement).classList.add("wanikani-pointer-none");
    this.modalEl.classList.add("wanikani-pointer-auto");

    this.reviews = await this.plugin.getReviews();
    // console.log("Fetched reviews:", this.reviews);
    this.currentIndex = 0;
  
    const closeButton = modalEl.querySelector(".modal-close-button") as HTMLElement;
    if (closeButton) {
      closeButton.classList.remove("wanikani-hidden");
      closeButton.classList.add("wanikani-visible");
    }

    this.renderNextReview();

    this.emergencyExitHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "w") {
        new Notice("Emergency exit activated");
        this.close();
      }
};
document.addEventListener("keydown", this.emergencyExitHandler);
  }
  onClose() {
    if (this.todayReviewsClear < this.plugin.settings.minReviews) {
      new Notice(`You must complete at least ${this.plugin.settings.minReviews} reviews! Remaining: ${this.plugin.settings.minReviews - this.todayReviewsClear}`);
      return;
    }
    this.contentEl.empty();
  }
}

class WaniKaniSettingTab extends PluginSettingTab {
  plugin: WaniKaniGatekeeperPlugin;

  constructor(app: App, plugin: WaniKaniGatekeeperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "WaniKani Gatekeeper Settings" });

    new Setting(containerEl)
      .setName("Min Reviews")
      .setDesc("Limit the number of reviews necessary to display gatekeeper exit")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.minReviews.toString())
          .onChange(async (value) => {
            this.plugin.settings.minReviews = Number(value) || 10;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Token")
      .setDesc("Enter your WaniKani API token")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Radical Color")
      .setDesc("Color for radical headers")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.radicalColor)
          .onChange(async (value) => {
            this.plugin.settings.radicalColor = value.trim() || "#1173cf";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Kanji Color")
      .setDesc("Color for kanji headers")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.kanjiColor)
          .onChange(async (value) => {
            this.plugin.settings.kanjiColor = value.trim() || "#e73c83";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Vocabulary Color")
      .setDesc("Color for vocabulary headers")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.vocabularyColor)
          .onChange(async (value) => {
            this.plugin.settings.vocabularyColor = value.trim() || "#7725d4";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Delay After Correct (ms)")
      .setDesc("Delay in milliseconds after a correct answer before showing the next review")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.delayAfterCorrect.toString())
          .onChange(async (value) => {
            this.plugin.settings.delayAfterCorrect = Number(value) || 1000;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Delay After Incorrect (ms)")
      .setDesc("Delay in milliseconds after an incorrect answer before showing the next review")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.delayAfterIncorrect.toString())
          .onChange(async (value) => {
            this.plugin.settings.delayAfterIncorrect = Number(value) || 3000;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Usage Instructions" });
    containerEl.createEl("p", { text: "1. Set your WaniKani API token above." });
    containerEl.createEl("p", { text: "2. When you have reviews available, the gatekeeper popup will appear." });
    containerEl.createEl("p", { text: "3. Complete at least the specified number of reviews to close the popup." });
    containerEl.createEl("p", { text: "4. If you need to access your vault urgently, press Ctrl+Alt+W or Esc to close the modal." });
  }
}
