describe('ng-picross', function() {
  beforeEach(function() {
    browser.get('/');
  });

  describe("visiting the first puzzle", function () {
    beforeEach(function () {
      element.all(by.css(".puzzle-choices a")).first().click();
    });

    it('has a 3x3 puzzle to start with', function () {
      expect(element.all(by.css('.board .row')).count()).toEqual(3);
      expect(element.all(by.css('.board .cell')).count()).toEqual(9);
    });
  });
});