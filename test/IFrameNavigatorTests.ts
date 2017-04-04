import { expect } from "chai";
import { stub } from "sinon";
import * as jsdom from "jsdom";

import IFrameNavigator from "../src/IFrameNavigator";
import Store from "../src/Store";
import Cacher from "../src/Cacher";
import { CacheStatus } from "../src/Cacher";
import PaginatedBookView from "../src/PaginatedBookView";
import ScrollingBookView from "../src/ScrollingBookView";
import Annotator from "../src/Annotator";
import Manifest from "../src/Manifest";
import BookSettings from "../src/BookSettings";
import { OfflineStatus } from "../src/BookSettings";
import MemoryStore from "../src/MemoryStore";

describe("IFrameNavigator", () => {
    let store: Store;

    let enable: Sinon.SinonStub;
    let onStatusUpdate: Sinon.SinonStub;
    let cacher: Cacher;

    let paginatorStart: Sinon.SinonStub;
    let onFirstPage: Sinon.SinonStub;
    let onLastPage: Sinon.SinonStub;
    let goToPreviousPage: Sinon.SinonStub;
    let goToNextPage: Sinon.SinonStub;
    let paginatorGoToPosition: Sinon.SinonStub;
    let paginatorCurrentPage: number;
    let paginator: PaginatedBookView;

    let scrollerStart: Sinon.SinonStub;
    let scroller: ScrollingBookView;

    let getLastReadingPosition: Sinon.SinonStub;
    let saveLastReadingPosition: Sinon.SinonStub;
    let annotator: Annotator;

    let offlineStatusElement: HTMLElement;
    let renderControls: Sinon.SinonStub;
    let onViewChange: Sinon.SinonStub;
    let onFontSizeChange: Sinon.SinonStub;
    let onOfflineEnabled: Sinon.SinonStub;
    let getSelectedView: Sinon.SinonStub;
    let getSelectedFontSize: Sinon.SinonStub;
    let getOfflineStatus: Sinon.SinonStub;
    let getOfflineStatusElement: Sinon.SinonStub;
    let askUserToEnableOfflineUse: Sinon.SinonStub;
    let settings: BookSettings;

    let element: HTMLElement;
    let navigator: IFrameNavigator;
    let span: HTMLElement;
    let link: HTMLAnchorElement;
    let linkClicked: Sinon.SinonStub;
    let parentLink: HTMLAnchorElement;
    let parentLinkClicked: Sinon.SinonStub;

    class MockCacher implements Cacher {
        public enable() {
            return enable();
        }
        public onStatusUpdate(callback: (status: CacheStatus) => void) {
            return onStatusUpdate(callback);
        }
    }

    class MockPaginator implements PaginatedBookView {
        public name = "mock";
        public label = "mock";
        public bookElement: Element;
        public sideMargin: number;
        public height: number;
        public start(position: number) {
            paginatorStart(position);
        }
        public stop() {}
        public getCurrentPosition() {
            return 0.25;
        }
        public onFirstPage() {
            return onFirstPage();
        }
        public onLastPage() {
            return onLastPage();
        }
        public goToPreviousPage() {
            goToPreviousPage();
        }
        public goToNextPage() {
            goToNextPage();
        }
        public goToPosition(position: number) {
            paginatorGoToPosition(position);
        }
        public getCurrentPage() {
            return paginatorCurrentPage;
        }
        public getPageCount() {
            return 8;
        }
    }

    class MockScroller extends ScrollingBookView {
        public bookElement: HTMLIFrameElement;
        public sideMargin: number;
        public start(position: number) {
            scrollerStart(position);
        }
        public getCurrentPosition() {
            return 0.25;
        }
    }

    class MockAnnotator implements Annotator {
        public start() {
            return new Promise<void>(resolve => resolve());
        }
        public getLastReadingPosition(): Promise<any> {
            return new Promise<any>(resolve => resolve(getLastReadingPosition()));
        }
        public saveLastReadingPosition(position: any): Promise<void> {
            return saveLastReadingPosition(position);
        }
    }

    class MockSettings extends BookSettings {
        public renderControls(element: HTMLElement) {
            renderControls(element);
        }
        public onViewChange(callback: () => void) {
            onViewChange(callback);
        }
        public onFontSizeChange(callback: () => void) {
            onFontSizeChange(callback);
        }
        public onOfflineEnabled(callback: () => void) {
            onOfflineEnabled(callback);
        }
        public getSelectedView() {
            return getSelectedView();
        }
        public getSelectedFontSize() {
            return getSelectedFontSize();
        }
        public getOfflineStatus() {
            return getOfflineStatus();
        }
        public getOfflineStatusElement() {
            return getOfflineStatusElement();
        }
        public askUserToEnableOfflineUse() {
            return askUserToEnableOfflineUse();
        }
    }

    const manifest = new Manifest({
        metadata: {
            title: "Title"
        },
        spine: [
            { href: "start.html", title: "Start" },
            { href: "item-1.html", title: "Item 1" },
            { href: "item-2.html" }
        ],
        toc: [
            { href: "item-1.html", "title": "Item 1" },
            { href: "item-2.html", "title": "Item 2" }
        ]
    }, new URL("http://example.com/manifest.json"));

    const click = (element: any) => {
        const event = document.createEvent("HTMLEvents");
        event.initEvent("click", false, true);
        element.dispatchEvent(event);
    };

    const pause = (ms = 0): Promise<void> => {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    };

    beforeEach(async () => {
        store = new MemoryStore();
        store.set("manifest", JSON.stringify(manifest));
        enable = stub();
        onStatusUpdate = stub();
        cacher = new MockCacher();

        paginatorStart = stub();
        onFirstPage = stub().returns(false);
        onLastPage = stub().returns(false);
        goToPreviousPage = stub();
        goToNextPage = stub();
        paginatorGoToPosition = stub();
        paginatorCurrentPage = 2;
        paginator = new MockPaginator();

        scrollerStart = stub();
        scroller = new MockScroller();

        getLastReadingPosition = stub();
        saveLastReadingPosition = stub().returns(new Promise(resolve => resolve()));
        annotator = new MockAnnotator();

        offlineStatusElement = document.createElement("div");
        renderControls = stub();
        onViewChange = stub();
        onFontSizeChange = stub();
        onOfflineEnabled = stub();
        getSelectedView = stub().returns(paginator);
        getSelectedFontSize = stub().returns("14px");
        getOfflineStatus = stub().returns(OfflineStatus.Disabled);
        getOfflineStatusElement = stub().returns(offlineStatusElement);
        askUserToEnableOfflineUse = stub();
        settings = await MockSettings.create(store, [paginator, scroller], [14, 16]);

        const window = jsdom.jsdom("", ({
            // This is useful for debugging errors in an iframe load event.
            virtualConsole: jsdom.createVirtualConsole().sendTo(console),
            resourceLoader: (resource: any, callback: any) => {
                // Load this HTML for every URL.
                callback(null, "<html><body>Some HTML for " + resource.url.href + "</body></html>");
            },
            features: {
                FetchExternalResources: ["iframe"],
                ProcessExternalResources: ["iframe"]
            }
        } as any)).defaultView;
        element = window.document.createElement("div");

        // The element must be in a document for iframe load events to work.
        window.document.body.appendChild(element);
        navigator = await IFrameNavigator.create(element, new URL("http://example.com/manifest.json"), store, cacher, settings, annotator, paginator, scroller);

        span = window.document.createElement("span");
        link = window.document.createElement("a");
        link.href = "http://example.com";
        link.protocol = "http";
        link.port = "";
        link.hostname = "example.com";
        linkClicked = stub();
        link.addEventListener("click", linkClicked);

        parentLink = window.document.createElement("a");
        parentLink.href = "http://example.com";
        parentLink.protocol = "http";
        parentLink.port = "";
        parentLink.hostname = "example.com";
        parentLinkClicked = stub();
        parentLink.addEventListener("click", parentLinkClicked);
        const child = window.document.createElement("span");
        parentLink.appendChild(child);
    });

    describe("#start", () => {
        it("should set element's HTML", async () => {
            expect(element.innerHTML).to.contain("iframe");
            expect(element.innerHTML).to.contain("controls");
            expect(element.innerHTML).to.contain("previous-page");
            expect(element.innerHTML).to.contain("next-page");
            expect(element.innerHTML).to.contain("links-toggle");
        });

        it("should render the settings controls", async () => {
            expect(renderControls.callCount).to.equal(1);
            const settingsView = element.querySelector("div[class='settings-view controls-view']") as HTMLDivElement;
            expect(renderControls.args[0][0]).to.equal(settingsView);
        });

        it("should render the book title", async () => {
            const bookTitle = element.querySelector(".book-title") as HTMLSpanElement;
            await pause();
            expect(bookTitle.innerHTML).to.equal("Title");
        });

        it("should render the chapter title", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const chapterTitle = element.querySelector(".chapter-title") as HTMLSpanElement;
            await pause();
            expect(chapterTitle.innerHTML).to.equal("(Start)");

            iframe.src = "http://example.com/item-1.html";
            await pause();
            expect(chapterTitle.innerHTML).to.equal("(Item 1)");

            iframe.src = "http://example.com/item-2.html";
            await pause();
            expect(chapterTitle.innerHTML).to.equal("(Chapter)");
        });

        it("should render the chapter position", async () => {
            const chapterPosition = element.querySelector(".chapter-position") as HTMLSpanElement;
            await pause();
            expect(chapterPosition.innerHTML).to.equal("Page 2 of 8");
        });

        it("should give the settings a function to update the book view when a new view is selected", async () => {
            expect(onViewChange.callCount).to.equal(1);
            let paginationControls = element.querySelector("div[class=pagination-controls]") as HTMLDivElement;
            let chapterPosition = element.querySelector(".chapter-position") as HTMLSpanElement;

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(1);

            paginatorCurrentPage = 4;
            const updateBookView = onViewChange.args[0][0];
            updateBookView();
            expect(paginationControls.style.display).not.to.equal("none");
            expect(document.body.style.overflow).to.equal("hidden");
            expect(chapterPosition.innerHTML).to.equal("Page 4 of 8");

            // A scroll event does nothing when the paginator is selected.
            document.body.onscroll(new UIEvent("scroll"));
            expect(saveLastReadingPosition.callCount).to.equal(1);

            getSelectedView.returns(scroller);

            updateBookView();
            expect(paginationControls.style.display).to.equal("none");
            expect(document.body.style.overflow).to.equal("auto");

            // Now a scroll event saves the new reading position.
            await document.body.onscroll(new UIEvent("scroll"));
            expect(saveLastReadingPosition.callCount).to.equal(2);
        });

        it("should give the settings a function to call when the font size changes", async () => {
            expect(onFontSizeChange.callCount).to.equal(1);
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;

            await pause();
            expect(iframe.contentDocument.body.style.fontSize).to.equal("14px");
            expect(iframe.contentDocument.body.style.lineHeight).to.equal("1.5");
            expect(paginator.sideMargin).to.equal(28);

            const updateFontSize = onFontSizeChange.args[0][0];

            getSelectedFontSize.returns("16px");
            updateFontSize();

            expect(iframe.contentDocument.body.style.fontSize).to.equal("16px");
            expect(iframe.contentDocument.body.style.lineHeight).to.equal("1.5");
            expect(paginator.sideMargin).to.equal(32);
            expect(paginatorGoToPosition.callCount).to.equal(2);
        });

        it("should give the settings a function to call when offline is enabled", () => {
            expect(onOfflineEnabled.callCount).to.equal(1);
            expect(enable.callCount).to.equal(0);

            const enableOffline = onOfflineEnabled.args[0][0];
            enableOffline();

            expect(enable.callCount).to.equal(1);
        });

        it("should render the cache status", () => {
           expect(onStatusUpdate.callCount).to.equal(1);
           const callback = onStatusUpdate.args[0][0];

           callback(CacheStatus.Uncached);
           expect(offlineStatusElement.innerHTML).to.contain("");

           callback(CacheStatus.UpdateAvailable);
           expect(offlineStatusElement.innerHTML).to.contain("new version");

           callback(CacheStatus.CheckingForUpdate);
           expect(offlineStatusElement.innerHTML).to.contain("Checking");

           callback(CacheStatus.Downloading);
           expect(offlineStatusElement.innerHTML).to.contain("Downloading");

           callback(CacheStatus.Downloaded);
           expect(offlineStatusElement.innerHTML).to.contain("Downloaded");

           callback(CacheStatus.Error);
           expect(offlineStatusElement.innerHTML).to.contain("Error");
        });

        it("should enable the cacher if offline is enabled in the settings", async () => {
            expect(enable.callCount).to.equal(0);

            getOfflineStatus.returns(OfflineStatus.Enabled);
            await IFrameNavigator.create(element, new URL("http://example.com/manifest.json"), store, cacher, settings, annotator, paginator, scroller);
            expect(enable.callCount).to.equal(1);
        });

        it("should ask the user to enable offline use if there's no selection", async () => {
            expect(askUserToEnableOfflineUse.callCount).to.equal(0);

            getOfflineStatus.returns(OfflineStatus.NoSelection);
            await IFrameNavigator.create(element, new URL("http://example.com/manifest.json"), store, cacher, settings, annotator, paginator, scroller);
            await pause(10);
            expect(askUserToEnableOfflineUse.callCount).to.equal(1);
        });

        it("should start the selected book view", async () => {
            await pause();
            expect(paginatorStart.callCount).to.equal(1);
            expect(paginatorStart.args[0][0]).to.equal(0);

            const paginationControls = element.querySelector("div[class=pagination-controls]") as HTMLDivElement;
            expect(paginationControls.style.display).not.to.equal("none");
        });

        it("should load first spine item in the iframe", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            expect(iframe).not.to.be.null;
            expect(iframe.src).to.equal("http://example.com/start.html");

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(1);
            expect(saveLastReadingPosition.args[0][0]).to.deep.equal({
                resource: "http://example.com/start.html",
                position: 0.25
            });
        });

        it("should navigate to the first spine item", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            iframe.src = "http://example.com/some-other-page.html";

            const startLink = element.querySelector("a[rel=start]") as HTMLAnchorElement;
            expect(startLink.href).to.equal("http://example.com/start.html");
            click(startLink);
            expect(iframe.src).to.equal("http://example.com/start.html");
        });

        it("should navigate to the previous spine item", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const originalSrc = iframe.src;
            const previous = element.querySelector("a[rel=prev]") as HTMLAnchorElement;

            // On the first page, the previous link won't be enabled.
            expect(previous.href).to.equal("");
            click(previous);
            expect(iframe.src).to.equal(originalSrc);

            // A later page will have a previous link.
            iframe.src = "http://example.com/item-2.html";
            await pause();
            expect(previous.href).to.equal("http://example.com/item-1.html");
            click(previous);
            expect(iframe.src).to.equal("http://example.com/item-1.html");

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(3);
            expect(saveLastReadingPosition.args[2][0]).to.deep.equal({
                resource: "http://example.com/item-1.html",
                position: 0.25
            });

            // A page that's not in the spine won't.
            iframe.src = "http://example.com/toc.html";
            await pause();
            expect(previous.href).to.equal("");
            click(previous);
            expect(iframe.src).to.equal("http://example.com/toc.html");
        });

        it("should navigate to the next spine item", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const next = element.querySelector("a[rel=next]") as HTMLAnchorElement;

            // On the last page, the previous link won't be enabled.
            iframe.src = "http://example.com/item-2.html";
            await pause();
            expect(next.href).to.equal("");
            click(next);
            expect(iframe.src).to.equal("http://example.com/item-2.html");

            // On an earlier page, it will.
            iframe.src = "http://example.com/item-1.html";
            await pause();
            expect(next.href).to.equal("http://example.com/item-2.html");
            click(next);
            expect(iframe.src).to.equal("http://example.com/item-2.html");

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(4);
            expect(saveLastReadingPosition.args[3][0]).to.deep.equal({
                resource: "http://example.com/item-2.html",
                position: 0.25
            });

            iframe.src = "http://example.com/toc.html";
            await pause();
            expect(next.href).to.equal("");
            click(next);
            expect(iframe.src).to.equal("http://example.com/toc.html");
        });

        it("should toggle the navigation links", async () => {
            jsdom.changeURL(window, "http://example.com");
            const links = element.querySelector("ul[class='links top']") as HTMLUListElement;
            const toggleElement = element.querySelector("div[class=links-toggle]");
            
            // Initially, the navigation links are visible.
            expect(links.style.display).not.to.equal("none");

            const iframe = element.querySelector("iframe") as HTMLIFrameElement;

            // If you click a link in the iframe, it doesn't toggle the links.
            iframe.contentDocument.elementFromPoint = stub().returns(link);
            click(toggleElement);
            expect(linkClicked.callCount).to.equal(1);
            expect(links.style.display).not.to.equal("none");

            // If the link is on a different origin, it opens in a new window.
            const openStub = stub(window, "open");
            link.hostname = "anotherexample.com";
            click(toggleElement);
            expect(linkClicked.callCount).to.equal(1);
            expect(openStub.callCount).to.equal(1);
            openStub.restore();

            // If you click an element inside a link, it still doesn't toggle.
            iframe.contentDocument.elementFromPoint = stub().returns(parentLink);
            click(toggleElement);
            expect(parentLinkClicked.callCount).to.equal(1);
            expect(links.style.display).not.to.equal("none");

            // But if you click somewhere else, it toggles.
            iframe.contentDocument.elementFromPoint = stub().returns(span);
            click(toggleElement);
            expect(links.style.display).to.equal("none");
            click(toggleElement);
            expect(links.style.display).not.to.equal("none");
        });

        it("should go to previous page", async () => {
            jsdom.changeURL(window, "http://example.com");
            const previousPageElement = element.querySelector("div[class=previous-page]");
            const chapterPosition = element.querySelector(".chapter-position") as HTMLSpanElement;
            
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            paginatorCurrentPage = 4;

            // If you click a link in the iframe, it doesn't change the page.
            iframe.contentDocument.elementFromPoint = stub().returns(link);
            click(previousPageElement);
            expect(linkClicked.callCount).to.equal(1);
            expect(onFirstPage.callCount).to.equal(0);
            expect(goToPreviousPage.callCount).to.equal(0);
            expect(chapterPosition.innerHTML).to.equal("Page 2 of 8");

            iframe.contentDocument.elementFromPoint = stub().returns(span);

            // If you're not on the first page, it goes to the previous page.
            click(previousPageElement);
            expect(onFirstPage.callCount).to.equal(1);
            expect(goToPreviousPage.callCount).to.equal(1);
            expect(chapterPosition.innerHTML).to.equal("Page 4 of 8");

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(2);
            expect(saveLastReadingPosition.args[1][0]).to.deep.equal({
                resource: "http://example.com/start.html",
                position: 0.25
            });

            // If you're on the first page of the first spine item, it does nothing.
            onFirstPage.returns(true);
            paginatorCurrentPage = 3;

            click(previousPageElement);
            expect(onFirstPage.callCount).to.equal(2);
            expect(goToPreviousPage.callCount).to.equal(1);
            expect(iframe.src).to.equal("http://example.com/start.html");
            expect(chapterPosition.innerHTML).to.equal("Page 4 of 8");

            // If you're on the first page of a later spine item, it goes to the
            // last page of the previous spine item.
            iframe.src = "http://example.com/item-2.html";
            await pause();
            iframe.contentDocument.elementFromPoint = stub().returns(span);
            expect(paginatorStart.callCount).to.equal(2);

            click(previousPageElement);
            expect(onFirstPage.callCount).to.equal(3);
            expect(goToPreviousPage.callCount).to.equal(1);
            expect(iframe.src).to.equal("http://example.com/item-1.html");

            await pause();
            expect(paginatorStart.callCount).to.equal(3);
            expect(paginatorStart.args[2][0]).to.equal(1);

            expect(saveLastReadingPosition.callCount).to.equal(4);
            expect(saveLastReadingPosition.args[3][0]).to.deep.equal({
                resource: "http://example.com/item-1.html",
                position: 0.25
            });
        });

        it("should go to next page", async () => {
            jsdom.changeURL(window, "http://example.com");
            const nextPageElement = element.querySelector("div[class=next-page]");
            const chapterPosition = element.querySelector(".chapter-position") as HTMLSpanElement;
            
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            paginatorCurrentPage = 4;

            // If you click a link in the iframe, it doesn't change the page.
            iframe.contentDocument.elementFromPoint = stub().returns(link);
            click(nextPageElement);
            expect(linkClicked.callCount).to.equal(1);
            expect(onLastPage.callCount).to.equal(0);
            expect(goToNextPage.callCount).to.equal(0);
            expect(chapterPosition.innerHTML).to.equal("Page 2 of 8");

            iframe.contentDocument.elementFromPoint = stub().returns(span);

            // If you're not on the last page, it goes to the next page.
            click(nextPageElement);
            expect(onLastPage.callCount).to.equal(1);
            expect(goToNextPage.callCount).to.equal(1);
            expect(chapterPosition.innerHTML).to.equal("Page 4 of 8");

            await pause();
            expect(saveLastReadingPosition.callCount).to.equal(2);
            expect(saveLastReadingPosition.args[1][0]).to.deep.equal({
                resource: "http://example.com/start.html",
                position: 0.25
            });

            // If you're on the last page of the last spine item, it does nothing.
            iframe.src = "http://example.com/item-2.html";
            await pause();
            iframe.contentDocument.elementFromPoint = stub().returns(span);
            onLastPage.returns(true);
            paginatorCurrentPage = 3;

            click(nextPageElement);
            expect(onLastPage.callCount).to.equal(2);
            expect(goToNextPage.callCount).to.equal(1);
            expect(iframe.src).to.equal("http://example.com/item-2.html");
            expect(chapterPosition.innerHTML).to.equal("Page 4 of 8");

            // If you're on the last page of an earlier spine item, it goes to the
            // first page of the next spine item.
            iframe.src = "http://example.com/item-1.html";
            await pause();
            iframe.contentDocument.elementFromPoint = stub().returns(span);
            expect(paginatorStart.callCount).to.equal(3);

            click(nextPageElement);
            expect(onLastPage.callCount).to.equal(3);
            expect(goToNextPage.callCount).to.equal(1);
            expect(iframe.src).to.equal("http://example.com/item-2.html");

            await pause();
            expect(paginatorStart.callCount).to.equal(4);
            expect(paginatorStart.args[3][0]).to.equal(0);

            expect(saveLastReadingPosition.callCount).to.equal(5);
            expect(saveLastReadingPosition.args[4][0]).to.deep.equal({
                resource: "http://example.com/item-2.html",
                position: 0.25
            });
        });

        it("should maintain paginator position when window is resized", async () => {
            expect(paginatorGoToPosition.callCount).to.equal(1);
            window.dispatchEvent(new Event('resize'));
            expect(paginatorGoToPosition.callCount).to.equal(2);
            expect(paginatorGoToPosition.args[0][0]).to.equal(0.25);
        });

        it("should update chapter position info when window is resized", async () => {
            const chapterPosition = element.querySelector(".chapter-position") as HTMLSpanElement;
            paginatorCurrentPage = 3;
            window.dispatchEvent(new Event('resize'));
            expect(chapterPosition.innerHTML).to.equal("Page 3 of 8");
        });

        it("should set heights on view and top and bottom info when loading iframe", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const linksTop = element.querySelector("ul[class='links top']") as HTMLUListElement;
            const linksBottom = element.querySelector("ul[class='links bottom']") as HTMLUListElement;
            const infoTop = element.querySelector("div[class='info top']") as HTMLDivElement;
            const infoBottom = element.querySelector("div[class='info bottom']") as HTMLDivElement;
            (linksTop as any).clientHeight = 10;
            (linksBottom as any).clientHeight = 20;
            (window as any).innerHeight = 100;

            iframe.src = "http://example.com/item-1.html";
            await pause();

            expect(paginator.height).to.equal(60);
            expect(scroller.height).to.equal(60);
            expect(infoTop.style.height).to.equal("10px");
            expect(infoBottom.style.height).to.equal("20px");
        });

        it("should show loading message while iframe is loading", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const loading = element.querySelector("div[class=loading]") as any;
            const next = element.querySelector("a[rel=next]") as HTMLAnchorElement;

            // Slow down annotator so the loading message has time to appear.
            saveLastReadingPosition.returns(new Promise<void>(async (resolve) => {
                await pause(300);
                resolve();
            }));

            iframe.src = "http://example.com/item-1.html";
            await pause();
            click(next);
            await pause(250);
            expect(loading.style.display).not.to.equal("none");
            await pause(100);
            expect(loading.style.display).to.equal("none");
        });
    });

    describe("table of contents", () => {
        it("should render each link in the manifest toc", async () => {
            const toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;

            const list = toc.querySelector("ul") as HTMLUListElement;
            expect(list.tagName.toLowerCase()).to.equal("ul");

            const links = list.querySelectorAll("li > a");
            expect(links.length).to.equal(2);

            const link1 = links[0] as HTMLAnchorElement;
            const link2 = links[1] as HTMLAnchorElement;
            expect(link1.href).to.equal("http://example.com/item-1.html");
            expect(link1.text).to.equal("Item 1");
            expect(link2.href).to.equal("http://example.com/item-2.html");
            expect(link2.text).to.equal("Item 2");
        });

        it("should show on first load if there's no last reading position yet", async () => {
            let toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;
            let contentsControl = element.querySelector("button.contents") as HTMLButtonElement;
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");

            getLastReadingPosition.returns("http://example.com/item-1.html");
            navigator = await IFrameNavigator.create(element, new URL("http://example.com/manifest.json"), store, cacher, settings, annotator, paginator, scroller);
            toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;
            contentsControl = element.querySelector("button.contents") as HTMLButtonElement;
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");
        });

        it("should show and hide when contents control is clicked", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement; 
            const contentsControl = element.querySelector("button.contents") as HTMLButtonElement;
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");
            expect(iframe.src).to.equal("http://example.com/start.html");

            click(contentsControl);
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");
            expect(iframe.src).to.equal("http://example.com/start.html");

            click(contentsControl);
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");
            expect(iframe.src).to.equal("http://example.com/start.html");
        });

        it("should hide when other navigation links are clicked", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            iframe.contentDocument.elementFromPoint = stub().returns(span);
            const toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;
            const contentsControl = element.querySelector("button.contents") as HTMLButtonElement;

            iframe.src = "http://example.com/item-1.html";
            await pause();
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");

            const nextChapterLink = element.querySelector("a[rel=next]") as HTMLAnchorElement;
            click(nextChapterLink);
            await pause();
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");

            click(contentsControl);
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");

            const previousChapterLink = element.querySelector("a[rel=prev]") as HTMLAnchorElement;
            click(previousChapterLink);
            await pause();
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");
        });

        it("should navigate to a toc item", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;
            expect(iframe.src).to.equal("http://example.com/start.html");

            const contentsControl = element.querySelector("button.contents") as HTMLButtonElement;
            click(contentsControl);

            const links = toc.querySelectorAll("li > a");
            const link1 = links[0] as HTMLAnchorElement;
            const link2 = links[1] as HTMLAnchorElement;

            click(link1);
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");
            expect(iframe.src).to.equal("http://example.com/item-1.html");

            click(contentsControl);
            expect(toc.style.display).not.to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("true");

            click(link2);
            expect(toc.style.display).to.equal("none");
            expect(contentsControl.getAttribute("aria-expanded")).to.equal("false");
            expect(iframe.src).to.equal("http://example.com/item-2.html");
        });

        it("should set class on the active toc item", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const toc = element.querySelector("div[class='contents-view controls-view']") as HTMLDivElement;

            const links = toc.querySelectorAll("li > a");
            const link1 = links[0] as HTMLAnchorElement;
            const link2 = links[1] as HTMLAnchorElement;

            expect(link1.className).to.equal("");
            expect(link2.className).to.equal("");

            iframe.src = "http://example.com/item-1.html";
            await pause();
            expect(link1.className).to.equal("active");
            expect(link2.className).to.equal("");

            iframe.src = "http://example.com/item-2.html";
            await pause();
            expect(link1.className).to.equal("");
            expect(link2.className).to.equal("active");
        });
    });

    describe("settings", () => {
        it("should show and hide when settings control is clicked", async () => {
            const iframe = element.querySelector("iframe") as HTMLIFrameElement;
            const settings = element.querySelector("div[class='settings-view controls-view']") as HTMLDivElement;
            const settingsControl = element.querySelector("button.settings") as HTMLButtonElement;
            expect(settings.style.display).to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("false");
            expect(iframe.src).to.equal("http://example.com/start.html");

            click(settingsControl);
            expect(settings.style.display).not.to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("true");
            expect(iframe.src).to.equal("http://example.com/start.html");

            click(settingsControl);
            expect(settings.style.display).to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("false");
            expect(iframe.src).to.equal("http://example.com/start.html");
        });

        it("should hide when settings view is clicked", async () => {
            const settings = element.querySelector("div[class='settings-view controls-view']") as HTMLDivElement;
            const settingsControl = element.querySelector("button.settings") as HTMLButtonElement;
            expect(settings.style.display).to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("false");

            click(settingsControl);
            expect(settings.style.display).not.to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("true");

            click(settings);
            expect(settings.style.display).to.equal("none");
            expect(settingsControl.getAttribute("aria-expanded")).to.equal("false");
        });
    });
});