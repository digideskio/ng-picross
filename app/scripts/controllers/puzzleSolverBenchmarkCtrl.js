'use strict';

angular.module('ngPicrossApp').controller('PuzzleSolverBenchmarkCtrl', function ($scope, $timeout, puzzleSolverService, puzzleCatalogService) {
  var allPuzzles = puzzleCatalogService.getAvailablePuzzles();
  $scope.solutionTimes = [];

  $scope.sortColumn = 'id';
  $scope.sortReverse = false;

  $scope.totalTime = 0;

  $scope.solving = true;

  $scope.orderBy = function (newColumn) {
    if (newColumn === $scope.sortColumn) {
      $scope.sortReverse = !$scope.sortReverse;
    } else {
      $scope.sortColumn = newColumn;
    }
  };

  function benchmarkPuzzle () {
    var start = Date.now();
    var listPuzzle = allPuzzles.shift();
    var puzzle = puzzleCatalogService.getPuzzle(listPuzzle.id);

    puzzleSolverService.solutionsForPuzzle({
      rows: puzzle.rowHints.map(function (h) { return _.pluck(h, 'value'); }),
      cols: puzzle.colHints.map(function (h) { return _.pluck(h, 'value'); })
    }).then(function (solutions) {
      if (solutions.length !== 1) {
        console.log("Something wrong with", listPuzzle.id);
      }

      var timeTaken = (Date.now() - start) / 1000;

      $scope.solutionTimes.push({id: parseInt(listPuzzle.id, 10), time: timeTaken});

      $scope.totalTime += timeTaken;

      if (allPuzzles.length > 0) {
        $timeout(benchmarkPuzzle, 0);
      } else {
        $scope.solving = false;
      }
    });
  }

  benchmarkPuzzle();
});
