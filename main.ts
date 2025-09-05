import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as wanakana from "wanakana";

interface WaniKaniPluginSettings {
  apiToken: string;
  radicalColor: string;
  kanjiColor: string;
  vocabularyColor: string;
  maxReviews: number;
}

const DEFAULT_SETTINGS: WaniKaniPluginSettings = {
  apiToken: "",
  radicalColor: "#1173cf",
  kanjiColor: "#e73c83",
  vocabularyColor: "#7725d4",
  maxReviews: 10,
};

if (!document.getElementById("confetti-script")) {
  const script = document.createElement("script");
  script.id = "confetti-script";
  script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js";
  document.head.appendChild(script);
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

      try {
        const reviews = await this.getReviews();
        let reviews_dict: {[key: string]: [number, number]} = {};
        reviews.forEach((rev) => {
          reviews_dict[rev.id] = [0,0];
        });
        console.log("Current reviews:", reviews);
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
      console.log(`Submitted review for assignment ${subject_id}`);
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
  allowEmergencyExit: boolean = false;
  emergencyExitHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(app: App, plugin: WaniKaniGatekeeperPlugin) {
    super(app);
    this.plugin = plugin;
  }
  
  renderNextReview() {
    const { contentEl } = this;
    contentEl.empty();
  
    if (this.currentIndex >= this.reviews.length) {
      new Notice("All WaniKani reviews complete ✅");


      const confetti = (window as any).confetti;
      if (confetti) {
        confetti({
          particleCount: 200,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
  
      const closeButton = this.modalEl.querySelector(".modal-close-button") as HTMLElement;
      if (closeButton) closeButton.style.display = "block";
  
      setTimeout(() => this.close(), 1500);
      return;
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
        readingInput.addEventListener("input", (e) => {
          const input = e.target as HTMLInputElement;
          input.value = wanakana.toHiragana(input.value);
        });
      }
    });
    
    const feedback = contentEl.createEl("p", { cls: "wanikani-feedback" });
    const btn = contentEl.createEl("button", {cls: "wanikani-submit", text: "Submit" });
    
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
      feedback.style.color = isCorrect ? "green" : "red";
      if (!isCorrect) {
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
        feedback.setText(`❌ Incorrect! Correct readings: ${correctReadings}`);
        }
        if (!meaningCorrect) {
        const correctMeanings = rev.data.meanings
          .map((m: any) => m.meaning)
          .join(", ");
        feedback.setText(`❌ Incorrect! Correct meanings: ${correctMeanings}`);
        }
        this.currentIndex++;
        setTimeout(() => {this.renderNextReview();}, 3000);
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
      }  
      this.currentIndex++;
      setTimeout(() => this.renderNextReview(), 1000);
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

    (this.modalEl.parentElement as HTMLElement).style.pointerEvents = "none";
    this.modalEl.style.pointerEvents = "auto"; 
    this.reviews = await this.plugin.getReviews();
    console.log("Fetched reviews:", this.reviews);
    this.currentIndex = 0;
  
    const closeButton = modalEl.querySelector(".modal-close-button") as HTMLElement;
    if (closeButton) closeButton.style.display = "none";

    this.renderNextReview();
    this.allowEmergencyExit = false;

    this.emergencyExitHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "w") {
        this.allowEmergencyExit = true;
        new Notice("Emergency exit activated");
        this.close();
      }
};
document.addEventListener("keydown", this.emergencyExitHandler);
  }
  onClose() {
    if (!this.allowEmergencyExit) {
      new Notice(`You must complete at least ${this.plugin.settings.maxReviews} reviews!`);
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
      .setName("Max Reviews")
      .setDesc("Limit the number of reviews necessary to display gatekeeper exit")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.maxReviews.toString())
          .onChange(async (value) => {
            this.plugin.settings.maxReviews = Number(value) || 10;
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

    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Usage Instructions" });
    containerEl.createEl("p", { text: "1. Set your WaniKani API token above." });
    containerEl.createEl("p", { text: "2. When you have reviews available, the gatekeeper popup will appear." });
    containerEl.createEl("p", { text: "3. Complete at least the specified number of reviews to close the popup." });
    containerEl.createEl("p", { text: "4. If you need to access your vault urgently, press Ctrl+Alt+W or Esc to close the modal." });
  }
}
