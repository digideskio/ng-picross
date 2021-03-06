'use strict';

angular.module('ngPicrossApp').service('puzzleSolverService', function ($q, $timeout, constantsService, matrixService, puzzleService, storageService) {
  var CellStates = constantsService.CellStates;
  var CELL_ON = 1;
  var CELL_OFF = 0;

  this.props = storageService.getObj('solverProps');

  this.persistProps = function (newProps) {
    if (!newProps) {
      return;
    }
    storageService.setObj('solverProps', newProps);
  };

  function hasCorrectHints (hints, candidatePuzzle) {
    for (var rowIx = 0; rowIx < hints.rows.length; rowIx++) {
      var rowHint = hints.rows[rowIx];
      var computedrowHints = puzzleService.hintsForLine(candidatePuzzle.rowMatrix[rowIx], CELL_ON);

      if (!_.isEqual(rowHint, computedrowHints)) {
        return false;
      }
    }

    for (var colIx = 0; colIx < hints.cols.length; colIx++) {
      var colHint = hints.cols[colIx];
      var computedColHints = puzzleService.hintsForLine(candidatePuzzle.colMatrix[colIx], CELL_ON);

      if (!_.isEqual(colHint, computedColHints)) {
        return false;
      }
    }

    return true;
  }

  function partialMatch (column, realHints, realHintTotal, spaces) {
    var firstUnchosenIndex = column.indexOf(null);
    var completedColumn = column.slice(0, firstUnchosenIndex === -1 ? undefined : firstUnchosenIndex);

    var computedHints = puzzleService.hintsForLine(completedColumn, CELL_ON);
    if (computedHints.length > realHints.length) {
      return false;
    }

    var partialHints = puzzleService.hintsForLine(column, CELL_ON);
    if (_.max(partialHints) > _.max(realHints)) {
      return false;
    }

    if (_.sum(column) > realHintTotal) {
      return false;
    }

    for (var i = 0; i < computedHints.length; i++) {
      if (computedHints[i] > realHints[i]) {
        return false;
      }
    }

    var noComputedHints = _.last(computedHints) === CELL_OFF;

    // If the last hint is 'complete' (there's a space after it)
    // and it's value is smaller than the real hint, give up.
    if (!noComputedHints) {
      var lastComputedHintIndex = computedHints.length - 1;
      if (_.last(completedColumn) === CELL_OFF && computedHints[lastComputedHintIndex] < realHints[lastComputedHintIndex]) {
        return false;
      }
    }

    var remainingSpaces = spaces - completedColumn.length;
    var remainingRuns = realHints.length - computedHints.length;
    if (noComputedHints) {
      remainingRuns += 1;
    }
    var spacesForRuns = realHintTotal - _.sum(computedHints);
    var spacesBetweenRuns = _.max([remainingRuns - 1, 0]);

    return (spacesForRuns + spacesBetweenRuns) <= remainingSpaces;
  }

  function cannotMatch (fullLine, partialLine) {
    for (var i = 0; i < partialLine.length; i++) {
      if (partialLine[i] !== null && partialLine[i] !== fullLine[i]) {
        return true;
      }
    }
    return false;
  }

  var PuzzleSolver = function (options) {
    angular.extend(this, options);

    this.colTotals = [];
    for (var j = 0; j < this.cols.length; j++) {
      this.colTotals.push(_.sum(this.cols[j]));
    }

    this.createInitialMatrix = function (candidatePuzzle) {
      candidatePuzzle.rowMatrix = [];
      candidatePuzzle.iterations = 0;

      for (var i = 0; i < candidatePuzzle.possibleRowArrangements.length; i++) {
        var arrangements = candidatePuzzle.possibleRowArrangements[i];

        // If there's only one possible arrangement, add it to the matrix unconditionally
        // with hope that it will speed up some of the column checks
        if (arrangements.length === 1) {
          candidatePuzzle.rowMatrix.push(arrangements[0]);
        } else {
          candidatePuzzle.rowMatrix.push(commonMarks(arrangements));
        }
      }

      this.syncColumnMatrix(candidatePuzzle);

      return this.markAllRequiredCells(candidatePuzzle);
    };

    this.syncColumnMatrix = function (candidatePuzzle) {
      candidatePuzzle.colMatrix = [];
      for (var colIndex = 0; colIndex < candidatePuzzle.rowMatrix[0].length; colIndex += 1) {
        candidatePuzzle.colMatrix.push(matrixService.col(candidatePuzzle.rowMatrix, colIndex));
      }
    };

    this.createInitialCandidatePuzzle = function () {
      var candidatePuzzle = {
        possibleRowArrangements: [],
        possibleColumnArrangements: [],
        rowCommonMarksCache: [],
        colCommonMarksCache: []
      };

      for (var rowIndex = 0; rowIndex < this.rows.length; rowIndex++) {
        var rowArrangements = [];
        calculateArrangements(_.clone(this.rows[rowIndex]), this.cols.length, rowArrangements);
        candidatePuzzle.possibleRowArrangements.push(rowArrangements);
      }

      for (var colIndex = 0; colIndex < this.cols.length; colIndex++) {
        var colArrangements = [];
        calculateArrangements(_.clone(this.cols[colIndex]), this.rows.length, colArrangements);
        candidatePuzzle.possibleColumnArrangements.push(colArrangements);
      }

      return candidatePuzzle;
    };

    this.bruteForce = function (candidatePuzzle, rowIx) {
      if (rowIx === this.rows.length) {
        if (hasCorrectHints(this, candidatePuzzle)) {
          this.solutions.push(candidatePuzzle.rowMatrix);
        }
        return;
      }

      // Skip branches of the tree where any column is already incorrect
      if (rowIx > 1) {
        for (var colIx = 0; colIx < this.cols.length; colIx++) {
          if (!partialMatch(candidatePuzzle.colMatrix[colIx], this.cols[colIx], this.colTotals[colIx], this.rows.length)) {
            return;
          }
        }
      }

      if (candidatePuzzle.rowMatrix[rowIx].indexOf(null) === -1) {
        return [[candidatePuzzle, rowIx + 1]];
      }

      var nextArrangements = candidatePuzzle.possibleRowArrangements[rowIx];
      var puzzleString = JSON.stringify(candidatePuzzle);

      var nextArgs = [];
      for (var i = 0; i < nextArrangements.length; i++) {
        var clone = JSON.parse(puzzleString);
        clone.rowMatrix[rowIx] = nextArrangements[i];
        this.syncColumnMatrix(clone);
        this.markAllRequiredCells(clone);
        if (clone.cannotMatch) {
          continue;
        }
        nextArgs.push([clone, rowIx + 1]);
      }
      return nextArgs;
    };

    function hasPartialMarks (line) {
      for (var i = 0; i < line.length; i++) {
        if (line[i] !== null) {
          return true;
        }
      }
      return false;
    }

    this.hasUnmarkedRequiredCells = function (puzzle, rowOrColumnIndex, isColumn) {
      var candidatePuzzle = this.createInitialCandidatePuzzle();

      var originalBoard = _.map(puzzle.board, function (row) {
        return _.map(row, function (cell) {
          if (cell.displayValue === 'x') {
            return 1;
          }
          if (cell.displayValue === 'b') {
            return 0;
          }
          return null;
        });
      });
      candidatePuzzle.rowMatrix = angular.copy(originalBoard);
      this.syncColumnMatrix(candidatePuzzle);

      var oldLine, newLine;
      if (isColumn) {
        _markRequiredCellsForLine(
          candidatePuzzle,
          candidatePuzzle.possibleColumnArrangements,
          candidatePuzzle.colMatrix,
          rowOrColumnIndex,
          isColumn
        );

        this.syncColumnMatrix(candidatePuzzle);
        oldLine = matrixService.col(originalBoard, rowOrColumnIndex);
        newLine = candidatePuzzle.colMatrix[rowOrColumnIndex];
      } else {
        _markRequiredCellsForLine(
          candidatePuzzle,
          candidatePuzzle.possibleRowArrangements,
          candidatePuzzle.rowMatrix,
          rowOrColumnIndex,
          isColumn
        );

        oldLine = matrixService.row(originalBoard, rowOrColumnIndex);
        newLine = candidatePuzzle.rowMatrix[rowOrColumnIndex];
      }

      return angular.toJson(oldLine) !== angular.toJson(newLine);
    };

    function _markRequiredCellsForLine (candidatePuzzle, arrangements, actual, rowOrColumnIndex, isColumn, commonMarksCache) {
      var recalculateCommonMarks = !commonMarksCache || commonMarksCache[rowOrColumnIndex];
      var line = actual[rowOrColumnIndex];
      if (hasPartialMarks(line)) {
        var arrangementCount = arrangements[rowOrColumnIndex].length;
        /* jshint -W083 */
        arrangements[rowOrColumnIndex] = arrangements[rowOrColumnIndex].filter(function (arrangement) {
          return !cannotMatch(arrangement, line);
        });
        /* jshint +W083 */
        if (arrangements[rowOrColumnIndex].length < arrangementCount) {
          recalculateCommonMarks = true;
        }

        if (arrangements[rowOrColumnIndex].length === 0) {
          candidatePuzzle.cannotMatch = true;
          candidatePuzzle.stillChecking = false;
          return;
        }
      }

      var theseCommonMarks;
      if (recalculateCommonMarks) {
        theseCommonMarks = commonMarks(arrangements[rowOrColumnIndex]);
        if (commonMarksCache) {
          commonMarksCache[rowOrColumnIndex] = theseCommonMarks;
        }
      } else {
        theseCommonMarks = commonMarksCache[rowOrColumnIndex];
      }

      return markLine(candidatePuzzle, theseCommonMarks, rowOrColumnIndex, isColumn);
    }

    function _markRequiredCells (candidatePuzzle, hints, arrangements, actual, isColumn) {
      var commonMarksCache = isColumn ? candidatePuzzle.colCommonMarksCache : candidatePuzzle.rowCommonMarksCache;

      var changed = false;
      for (var i = 0; i < hints.length; i++) {
        changed = changed || _markRequiredCellsForLine(candidatePuzzle, arrangements, actual, i, isColumn, commonMarksCache);

      }
      return changed;
    }

    this.markRequiredCells = function (candidatePuzzle) {
      candidatePuzzle.iterations += 1;

      var changed = false;

      changed = changed || _markRequiredCells(
        candidatePuzzle,
        this.cols,
        candidatePuzzle.possibleColumnArrangements,
        candidatePuzzle.colMatrix,
        true
      );

      if (candidatePuzzle.stillChecking) {
        changed = changed || _markRequiredCells(
          candidatePuzzle,
          this.rows,
          candidatePuzzle.possibleRowArrangements,
          candidatePuzzle.rowMatrix,
          false
        );
      }

      if (candidatePuzzle.stillChecking) {
        candidatePuzzle.stillChecking = changed;
      }
    };

    this.markAllRequiredCells = function (candidatePuzzle) {
      var deferred = $q.defer();

      var self = this;
      function chainTimeout () {
        $timeout(function () {
          self.markRequiredCells(candidatePuzzle);
          if (candidatePuzzle.stillChecking) {
            chainTimeout();
            if (self.showProgress) {
              var partialPuzzleSolution = binaryToCellStates(candidatePuzzle.rowMatrix);
              self.progressDeferred.notify(partialPuzzleSolution);
            }
          } else {
            deferred.resolve(candidatePuzzle);
          }
        }, 0);
      }

      candidatePuzzle.stillChecking = true;
      if (this.showProgress) {
        chainTimeout();
      } else {
        while (candidatePuzzle.stillChecking) {
          this.markRequiredCells(candidatePuzzle);
        }
        deferred.resolve(candidatePuzzle);
      }

      return deferred.promise;
    };
  };

  function pushN (arr, item, n) {
    for (var i = 0; i < n; i++) {
      arr.push(item);
    }
  }

  function calculateArrangements (remainingHints, totalSpaces, arrangements, current) {
    if (!current) {
      current = [];
    }

    if (_.isEqual(remainingHints, [0])) {
      var spacey = [];
      pushN(spacey, CELL_OFF, totalSpaces);
      arrangements.push(spacey);
      return;
    }

    var remainingSpaces = totalSpaces - current.length;
    if (remainingHints.length === 0) {
      pushN(current, CELL_OFF, totalSpaces - current.length);
      arrangements.push(current);
      return;
    }

    var spacesBetweenRemainingHints = remainingHints.length - 1;
    var wiggleRoom = remainingSpaces - _.sum(remainingHints) - spacesBetweenRemainingHints;
    var hint = remainingHints.shift();

    for (var i = 0; i < wiggleRoom + 1; i++) {
      var nextCurrent = _.clone(current);
      pushN(nextCurrent, CELL_OFF, i);
      pushN(nextCurrent, CELL_ON, hint);

      // Ensure there is always a space between groups
      if ((remainingSpaces - hint - i) > 0) {
        pushN(nextCurrent, CELL_OFF, 1);
      }

      calculateArrangements(_.clone(remainingHints), totalSpaces, arrangements, nextCurrent);
    }
  }

  this.arrangementsForHint = function (hints, spaces) {
    var result = [];
    calculateArrangements(_.clone(hints), spaces, result);
    return result;
  };

  function binaryToCellStates (solution) {
    return _.map(solution, function (solutionRows) {
      return _.map(solutionRows, function (solutionCol) {
        if (solutionCol === CELL_ON) {
          return CellStates.x;
        } else if (solutionCol === CELL_OFF) {
          return CellStates.b;
        }
        return CellStates.o;
      });
    });
  }

  function commonMarks (arrangements) {
    if (!arrangements[0]) {
      return;
    }

    var result = [];

    for (var cellIndex = 0; cellIndex < arrangements[0].length; cellIndex++) {
      var mark = arrangements[0][cellIndex];
      for (var arrangementIndex = 1; arrangementIndex < arrangements.length; arrangementIndex++) {
        if (arrangements[arrangementIndex][cellIndex] !== mark) {
          mark = null;
          break;
        }
      }
      result.push(mark);
    }
    return result;
  }

  function setMatrixCell (candidatePuzzle, rowIndex, columnIndex, value) {
    candidatePuzzle.rowMatrix[rowIndex][columnIndex] = value;
    candidatePuzzle.colMatrix[columnIndex][rowIndex]= value;
  }

  function markLine (candidatePuzzle, marks, rowOrColumnIndex, isColumn) {
    var matrix = candidatePuzzle.rowMatrix;
    if (!marks) {
      return;
    }

    var changed = false;
    for (var markIndex = 0; markIndex < marks.length; markIndex++) {
      var value = marks[markIndex];
      if (value === null) {
        continue;
      }

      var existingRowValue;
      if (isColumn) {
        existingRowValue = matrix[markIndex][rowOrColumnIndex];
      } else {
        existingRowValue = matrix[rowOrColumnIndex][markIndex];
      }
      if (existingRowValue !== value) {
        changed = true;
        if (isColumn) {
          setMatrixCell(candidatePuzzle, markIndex, rowOrColumnIndex, value);
        } else {
          setMatrixCell(candidatePuzzle, rowOrColumnIndex, markIndex, value);
        }
      }
    }
    return changed;
  }

  this.createSolverFromPuzzle = function (puzzle) {
    return new PuzzleSolver({
      rows: puzzle.rowHints.map(function (h) { return _.map(h, 'value'); }),
      cols: puzzle.colHints.map(function (h) { return _.map(h, 'value'); }),
    });
  };

  this.solutionsForPuzzle = function (hints, options) {
    function runRounds (solver, bruteForceArgs) {
      var startTime = new Date();

      while (bruteForceArgs.length > 0) {
        var elapsed = new Date() - startTime;
        if (elapsed > 1000) {
          return true;
        }

        var theseArgs = bruteForceArgs.shift();
        var newArgs = solver.bruteForce.apply(solver, theseArgs);
        if (newArgs) {
          Array.prototype.unshift.apply(bruteForceArgs, newArgs);
        }
      }

      return false;
    }

    function solveIteratively (solver, initialPuzzle) {
      var deferred = $q.defer();
      var bruteForceArgs = [[initialPuzzle, 0]];

      function go () {
        if (runRounds(solver, bruteForceArgs)) {
          $timeout(go, 0);
          if (options && options.showProgress) {
            var partialPuzzleSolution = binaryToCellStates(bruteForceArgs[0][0].rowMatrix);
            deferred.notify(partialPuzzleSolution);
          }
        } else {
          deferred.resolve();
        }
      }

      go();

      return deferred.promise;
    }

    var deferred = $q.defer();
    var solver = new PuzzleSolver(angular.extend(hints, (options || {}), {
      solutions: [],
      progressDeferred: deferred
    }));
    var candidatePuzzle = solver.createInitialCandidatePuzzle();

    solver.createInitialMatrix(candidatePuzzle).then(function (initialPuzzle) {
      solveIteratively(solver, initialPuzzle).then(function () {
        deferred.resolve({
          solutions: _.map(solver.solutions, binaryToCellStates),
          iterations: initialPuzzle.iterations
        });
      }, null, deferred.notify);
    });

    return deferred.promise;
  };
});
